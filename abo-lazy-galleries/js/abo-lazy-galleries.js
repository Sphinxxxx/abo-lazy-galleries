"use strict";

var ABOLG = ABOLG || {};

(function (ABOLG, $, undefined) {

	var _placeholders,
		_placeholderSelector = abolg_settings.abolg_placeholder_selector,
		_classLoading = 'abolg-loading',
		_classLoaded = 'abolg-loaded',
		_classRendering = 'abolg-rendering',
		_classRendered = 'abolg-rendered',
		_tagLoadedHtml = 'abolg-loadedhtml',
		_tagLayoutWidth = 'abolg-layoutwidth',
		_tagLayoutHeight = 'abolg-layoutheight',
		_renderedGalleries = [];

	var utils = {
		hasClass: function(element, className) {
			var classList = element.classList;
			if(classList) {
				return classList.contains(className);
			}
			else {
				return $(element).hasClass(className);
			}
		},
		isElementInViewport: function(el) {
			var rect = el.getBoundingClientRect();
			//Safeguard needed for mobile browsers when there's a video on the page(?)...
			if((rect.bottom <= rect.top) || (rect.right <= rect.left)) { return false; }
			
			//http://stackoverflow.com/questions/16005136/how-do-i-see-if-two-rectangles-intersect-in-javascript-or-pseudocode
			var isOutside = (rect.top >= $(window).height())
						  ||(rect.bottom <= 0)
						  ;
			return !isOutside;
		}
	};
	

	function init()
	{
		_placeholders = $(_placeholderSelector);
		ABOLG.placeholders = _placeholders;
	}
	
	function isHandled(placeholder) {
		return (utils.hasClass(placeholder, _classLoading) || utils.hasClass(placeholder, _classLoaded));
	}
	function isRendered(placeholder) {
		return (utils.hasClass(placeholder, _classRendering) || utils.hasClass(placeholder, _classRendered));
	}
	function waitingForRendering(placeholder) {
		return (utils.hasClass(placeholder, _classLoaded) && !isRendered(placeholder));
	}

	//http://stackoverflow.com/questions/123999/how-to-tell-if-a-dom-element-is-visible-in-the-current-viewport
	function checkPlaceholders() {
		_placeholders.each(function() {
			/*
			if(isHandled(this)) { return; }
			
			if(utils.isElementInViewport(this)) {
				loadGallery(this);
			}
			*/
			if(!isHandled(this)) {
				if(utils.isElementInViewport(this)) {
					loadGallery(this);
				}
			}
			else if(waitingForRendering(this)) {
				if(utils.isElementInViewport(this)) {
					renderGallery(null, this);
				}
			}
		});
	}

	function loadGallery(placeholder) {
		if(isHandled(placeholder)) { return; }

		placeholder = $(placeholder);

		var eagerHtml = placeholder.attr(abolg_settings.abolg_eagerhtml_attr);
		if(eagerHtml) {
			placeholder.addClass(_classLoaded);
			renderGallery(eagerHtml, placeholder);
		}
		else {
			placeholder.addClass(_classLoading);
			
			//Ajax call to admin-ajax.php
			//https://codex.wordpress.org/AJAX_in_Plugins
			var data = {
				action: abolg_settings.abolg_callback_action,
				abolg_gallery_shortcode: placeholder.attr(abolg_settings.abolg_shortcode_attr)
			}
			//console.log('abolg loadGallery'/*, data*/);
			
			$.get(abolg_settings.ajaxurl, data)
				.done(function(html) {
					placeholder.removeClass(_classLoading)
							   .addClass(_classLoaded);
					//If the gallery is still within the viewport, we render it.
					//If not, we wait so we don't push the page downward if the user is reading something below this point:
					if(utils.isElementInViewport(placeholder[0])) {
						renderGallery(html, placeholder);
					}
					else {
						placeholder.data(_tagLoadedHtml, html);
					}
				});
		}
	}
	
	function renderGallery(html, placeholder) {
		placeholder = $(placeholder);
		html = html || placeholder.data(_tagLoadedHtml);
		
		placeholder.addClass(_classRendering);
		//console.log('abolg renderGallery');
		
		var gallery = $(html);
		//Remove the standard gallery-columns-?? class from the gallery,
		//because this class is often used for "max-width" or "clear" rules in a fixed-column gallery:
		//http://stackoverflow.com/questions/2644299/jquery-removeclass-wildcard
		gallery.attr('class', function(i, c) {
			return c ? c.replace(/(^|\s)gallery-columns-\S+/g, '')
					 : c;
		});
		//Remove the <br> elements which separate each row in the default WP gallery:
		gallery.find('br').remove();

		function addGallery() {
			placeholder.html(gallery);
			placeholder.height('auto');
			placeholder.removeClass(_classRendering)
					   .addClass(_classRendered);

			_renderedGalleries.push(gallery);
			
			//For lightbox plugins etc:
			placeholder.trigger('abolg:loaded');
		}

		//Layout and animate the gallery to its correct height:
		layoutGallery(gallery, placeholder);
		placeholder.animate({ height: placeholder.data(_tagLayoutHeight) },
							{ duration: 1000, complete: addGallery });
	}
	
	function layoutGallery(gallery, placeholder) {
		placeholder = placeholder || gallery.closest(_placeholderSelector);
		
		var phWidth = placeholder.width();
		//A little slack for rounding the thumbnail widths:
		phWidth--;
		
		//Safeguard needed for mobile browsers when there's a video on the page(?)...
		if(phWidth <= 0) { return; }
		
		if(placeholder.data(_tagLayoutWidth) === phWidth) {
			//Browser resize that didn't affect the gallery's width:
			return;
		}
		//console.log('abolg layoutGallery', phWidth);
		
		//Get the natural size of all thumbs:
		var thumbs = gallery.children('.gallery-item').map(function() {
			var img = this.querySelector('img');
			return {
				//WP kindly provides an image's size in its <img> width and height attributes:
				w: Number(img.getAttribute('width')),
				h: Number(img.getAttribute('height')),
				elm: this
			};
		})
		.get();

		//Adjust the size of all thumbnails:
		var margin = Number(abolg_settings.abolg_margin),
			thumbsCount = thumbs.length,
			thumbIndex = 0;
			
		function resizeThumbToHeight(t, height) {
			t.w = t.w * (height/t.h);
			t.h = height;
		}
		function getRowWidth(thumbsRow) {
			var w = 0;
			if(thumbsRow.length) {
				thumbsRow.forEach(function(t) { w += t.w + margin; });
				w -= margin;
			}
			return w;
		}
		
		var galleryHeight = 0,
			maxRowHeight = 0;
		while(thumbIndex < thumbsCount) {
		
			var row = [],
				minHeight = thumbs[thumbIndex].h;
				
			//To fill a row, collect thumbnails...
			while((thumbIndex < thumbsCount) &&
				  //...until we reach the total placeholder width:
				  (getRowWidth(row) < phWidth)) {
				  
				var thumb = thumbs[thumbIndex++];
				
				//Each thumb in a row must be the same height, 
				//so shrink each thumb to be as tall as the shortest one:
				if(thumb.h > minHeight) {
					resizeThumbToHeight(thumb, minHeight);
				}
				else if(thumb.h < minHeight) {
					minHeight = thumb.h;
					row.forEach(function(t) { resizeThumbToHeight(t, minHeight); });
				}
				
				row.push(thumb);
			}
			
			//Now we have enough thumbnails to fill a row. Final size adjustments:
			var rowWidth = getRowWidth(row),
				topMargin = (thumbIndex === row.length) ? 0 : margin,
				finalHeight = minHeight;
			
			if(rowWidth > phWidth) {
				var totalMargin = margin * (row.length-1);
				finalHeight = minHeight * (phWidth-totalMargin)/(rowWidth-totalMargin);
			}
			//We even shrink the thumbnails a final unfinished row, 
			//because it would look strange to let those thumbnails be larger than the others:
			else if((thumbIndex === thumbsCount) && (maxRowHeight > 0)) {
				finalHeight = Math.min(maxRowHeight, minHeight);
			}
			
			if(finalHeight !== minHeight) {
				row.forEach(function(t) { resizeThumbToHeight(t, finalHeight); });
			}
			row.forEach(function(t) {
				var elm = $(t.elm),
					leftMargin = (t === row[0]) ? 0 : margin;
				
				elm.width(t.w);
				elm.height(t.h);
				//elm.css('margin-left', leftMargin);
				//elm.css('margin-top', topMargin);
				elm.css('margin', [topMargin, 0, 0, leftMargin].map(function(x){ return x+'px'; }).join(' '));
			});
			
			galleryHeight += finalHeight + topMargin;
			maxRowHeight = Math.max(maxRowHeight, finalHeight);
		}
		
		placeholder.data(_tagLayoutWidth, phWidth);
		placeholder.data(_tagLayoutHeight, galleryHeight);
	}


	$(window).load(function() {
		init();
		
		$(window).on('resize scroll', checkPlaceholders);
		$(window).on('resize', function() {
			_renderedGalleries.forEach(function(gallery) { layoutGallery(gallery); });
		});
		checkPlaceholders();
	});

	ABOLG.loadedGalleries = _renderedGalleries;
	ABOLG.layoutGallery = layoutGallery;
	
})(ABOLG, jQuery);