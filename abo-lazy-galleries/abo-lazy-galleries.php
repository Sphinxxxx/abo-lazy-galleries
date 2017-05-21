<?php
/*
Plugin Name: ABO Lazy Galleries
Description: Lazy-load entire WP [gallery]s.
Version: 1.1.5
Author: Andreas Borgen
Author URI: http://what.enthuses.me
License: MIT
*/

//Settings for the "Responsive Lightbox" plugin if used together with this plugin:
//
//	Galleries:				Add lightbox to WordPress image galleries by default.
//	Gallery image size:		Large (<- to avoid linking to the "full" image)
//	Gallery image title:	Image Caption
//	Custom events:			Enable triggering lightbox on custom jQuery events
//							-->	abolg:loaded


if( !class_exists('ABOLazyGalleries') ):

	class ABOLazyGalleries {
	
		private $callbackToRender = [];

		function __construct(){
			define('ABOLG_PATH', plugin_dir_path(__FILE__));
			define('ABOLG_URL', plugins_url('', __FILE__));
			define('ABOLG_VERSION', '1.1.5');
			define('ABOLG_PLACEHOLDER_CLASS', 'abolg-gallery-placeholder');
			define('ABOLG_SHORTCODE_ATTR', 'data-gallery-shortcode');
			define('ABOLG_EAGERHTML_ATTR', 'data-gallery-eagerhtml');
			define('ABOLG_ACTION_FETCH', 'abolg_fetch_gallery');
			
			//https://codex.wordpress.org/AJAX_in_Plugins
			//https://codex.wordpress.org/Plugin_API/Action_Reference/wp_ajax_(action)
			add_action( 'wp_ajax_'.ABOLG_ACTION_FETCH, array($this, 'fetch_gallery') );
			add_action( 'wp_ajax_nopriv_'.ABOLG_ACTION_FETCH, array($this, 'fetch_gallery') );

			add_action( 'wp_enqueue_scripts', array($this, 'register_scripts') );

			//Hijack the [gallery] shortcode
			//https://codex.wordpress.org/Function_Reference/add_shortcode
			//"There can only be one hook for each shortcode..."
			add_shortcode( 'gallery', array($this, 'render_placeholder') );
		}	


		/*
		*  register_scripts
		*  Prepare the scripts we'll need if we encounter a [gallery] shortcode or two.
		*/
		function register_scripts() {
			//https://codex.wordpress.org/Function_Reference/wp_register_script#Usage_Rationale
			wp_register_script('abo-lazy-galleries', plugins_url( 'js/abo-lazy-galleries.js', __FILE__ ), array('jquery'), ABOLG_VERSION, true);
   			wp_register_style('abo-lazy-galleries', plugins_url('css/abo-lazy-galleries.css', __FILE__ ), array(), ABOLG_VERSION);
		}
		
		/*
		*  enqueue_scripts
		*  Enqueue our scripts and create our localize variables
		*/
		function enqueue_scripts($margin) {
			//Don't add multiple declarations of the abolg_settings variable on a page.
			//(Also, don't call wp_enqueue_script() more than necessary, 
			// but WP handles that and doesn't cause duplicate <script> tags):
			if(wp_script_is( 'abo-lazy-galleries', 'enqueued' )) { return; }
		
			wp_enqueue_script('abo-lazy-galleries');
   			wp_enqueue_style('abo-lazy-galleries');

			//https://codex.wordpress.org/AJAX_in_Plugins#Ajax_on_the_Viewer-Facing_Side
			wp_localize_script(
				'abo-lazy-galleries',
				'abolg_settings',
				array(
					'ajaxurl'					=> admin_url('admin-ajax.php'),
					//'abolg_nonce'				=> wp_create_nonce( "abo_lazy_galleries_nonce" ),
					'abolg_placeholder_selector'=> '.'.ABOLG_PLACEHOLDER_CLASS,
					'abolg_shortcode_attr'		=> ABOLG_SHORTCODE_ATTR,
					'abolg_eagerhtml_attr'		=> ABOLG_EAGERHTML_ATTR,
					'abolg_callback_action'		=> ABOLG_ACTION_FETCH,
					'abolg_margin'				=> $margin
				)
			);
		}

		
		function getAttr($atts, $key) {
			if( isset($atts[$key]) ) {
				return strtolower(trim($atts[$key]));
			}
			else {
				return false;
			}
		}
		function getGalleryID($atts) {
			//Identify each gallery by their images:
			$id = $this->getAttr($atts, 'ids');
			return $id;
		}
		function getStandardGallery($atts) {
			$id = $this->getGalleryID($atts);
			$this->callbackToRender[$id] = true;
			
			//The standard WP gallery:
			return gallery_shortcode( $atts );
		}

		/*
		*  render_placeholder
		*  Render a temporary placeholder where a gallery should be
		*/
		function render_placeholder( $atts, $content = null ) {
			//$info = '<!--' . serialize($atts) . '-->';
			//echo $info;

			$id = $this->getGalleryID($atts);
			
			if( $this->getAttr($atts, 'abolg_ignore') === 'true' ) {
				//Revert to the standard WP gallery:
				return $this->getStandardGallery( $atts );
			}
		
			//fetch_gallery() (and abolg_mode=eager) calls WP's default gallery_shortcode() to build the gallery html.
			//In turn, gallery_shortcode() calls a set of filters, which other plugins may interact with.
			//If one such plugin (e.g. "WP Gallery Custom Links") decides to build its html using the current 
			//[gallery] shortcode function (call_user_func( $GLOBALS['shortcode_tags']['gallery'], $attr )),
			//we end up here.
			//If so, we should *not* render another placeholder, but instead render the actual gallery:
			if(isset( $this->callbackToRender[$id] )) {
				//return $content;
				return $this->getStandardGallery( $atts );
			}
			

			$atts_abolg = shortcode_atts(
				array(
					'margin' => 5,
					'abolg_mode' => 'lazy'
				),
				$atts,
				//Use the standard gallery shortcode name, 
				//so our settings can be overridden at the same place other gallery settings are overridden
				//http://wordpress.stackexchange.com/a/95971/63654
				'gallery'
			);
			
			//Now we know that we'll need our scripts:
			$this->enqueue_scripts($atts_abolg['margin']);

			//Eager-load the gallery?
			if( $this->getAttr($atts_abolg, 'abolg_mode') === 'eager' ) {
				//$this->callbackToRender = true;
				$eager = $this->getStandardGallery( $atts );

				$html = sprintf('<div class="%s" %s="%s" ></div>', 
								ABOLG_PLACEHOLDER_CLASS, ABOLG_EAGERHTML_ATTR, esc_attr($eager));
			}
			//Serialize the *original* shortcode we'll send to gallery_shortcode later, in fetch_gallery()...
			else {
				$attsSerialized = esc_attr(serialize($atts));
				$html = sprintf('<div class="%s" %s="%s" ></div>', 
								ABOLG_PLACEHOLDER_CLASS, ABOLG_SHORTCODE_ATTR, $attsSerialized);
			}

			return $html;
		}


		/*
		*  fetch_gallery
		*  Lazy-load an actual gallery
		*/
		function fetch_gallery() {
			//$this->callbackToRender = true;
			/*
			$nonce = $_GET['nonce'];
			if(!is_user_logged_in()){ // Skip nonce verification if user is logged in
				if (!wp_verify_nonce( $nonce, 'abo_lazy_galleries_nonce' )) // Check our nonce, if they don't match then bounce!
					die('Error, could not verify WP nonce.');
				}
			}
			*/
			
			$attsSerialized = isset($_GET['abolg_gallery_shortcode'])
								//WordPress and their Magic Quotes...
								//https://codex.wordpress.org/Function_Reference/stripslashes_deep#Good_Coding_Practice
								//http://stackoverflow.com/questions/9404505/why-does-wordpress-still-use-addslashes-register-globals-and-magic-quotes
								? stripslashes($_GET['abolg_gallery_shortcode'])
								: array();
			$atts = unserialize($attsSerialized);

			$gallery = $this->getStandardGallery( $atts ); //gallery_shortcode( $atts );
			echo $gallery;
			
			//https://codex.wordpress.org/AJAX_in_Plugins
			//"Most of the time you should be using wp_die() in your Ajax callback ..."
			wp_die();
		}

	}



	/*
	*  ABOLazyGalleries
	*  Initialize a global singleton ABOLazyGalleries instance.
	*/
	function ABOLazyGalleries() {
		global $abo_lazy_galleries;

		if( !isset($abo_lazy_galleries) )
		{
			$abo_lazy_galleries = new ABOLazyGalleries();
		}
		return $abo_lazy_galleries;
	}
	//Initialize
	ABOLazyGalleries();


endif; // class_exists check
