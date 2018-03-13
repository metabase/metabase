/*! Split.js - v1.3.5 */
// https://github.com/nathancahill/Split.js
// Copyright (c) 2017 Nathan Cahill; Licensed MIT

(function(global, factory) {
  typeof exports === "object" && typeof module !== "undefined"
    ? (module.exports = factory())
    : typeof define === "function" && define.amd
      ? define(factory)
      : (global.Split = factory());
})(this, function() {
  "use strict";
  // The programming goals of Split.js are to deliver readable, understandable and
  // maintainable code, while at the same time manually optimizing for tiny minified file size,
  // browser compatibility without additional requirements, graceful fallback (IE8 is supported)
  // and very few assumptions about the user's page layout.
  var global = window;
  var document = global.document;

  // Save a couple long function names that are used frequently.
  // This optimization saves around 400 bytes.
  var addEventListener = "addEventListener";
  var removeEventListener = "removeEventListener";
  var getBoundingClientRect = "getBoundingClientRect";
  var NOOP = function() {
    return false;
  };

  // Figure out if we're in IE8 or not. IE8 will still render correctly,
  // but will be static instead of draggable.
  var isIE8 = global.attachEvent && !global[addEventListener];

  // This library only needs two helper functions:
  //
  // The first determines which prefixes of CSS calc we need.
  // We only need to do this once on startup, when this anonymous function is called.
  //
  // Tests -webkit, -moz and -o prefixes. Modified from StackOverflow:
  // http://stackoverflow.com/questions/16625140/js-feature-detection-to-detect-the-usage-of-webkit-calc-over-calc/16625167#16625167
  var calc =
    ["", "-webkit-", "-moz-", "-o-"]
      .filter(function(prefix) {
        var el = document.createElement("div");
        el.style.cssText = "width:" + prefix + "calc(9px)";

        return !!el.style.length;
      })
      .shift() + "calc";

  // The second helper function allows elements and string selectors to be used
  // interchangeably. In either case an element is returned. This allows us to
  // do `Split([elem1, elem2])` as well as `Split(['#id1', '#id2'])`.
  var elementOrSelector = function(el) {
    if (typeof el === "string" || el instanceof String) {
      return document.querySelector(el);
    }

    return el;
  };

  // The main function to initialize a split. Split.js thinks about each pair
  // of elements as an independant pair. Dragging the gutter between two elements
  // only changes the dimensions of elements in that pair. This is key to understanding
  // how the following functions operate, since each function is bound to a pair.
  //
  // A pair object is shaped like this:
  //
  // {
  //     a: DOM element,
  //     b: DOM element,
  //     aMin: Number,
  //     bMin: Number,
  //     dragging: Boolean,
  //     parent: DOM element,
  //     isFirst: Boolean,
  //     isLast: Boolean,
  //     direction: 'horizontal' | 'vertical'
  // }
  //
  // The basic sequence:
  //
  // 1. Set defaults to something sane. `options` doesn't have to be passed at all.
  // 2. Initialize a bunch of strings based on the direction we're splitting.
  //    A lot of the behavior in the rest of the library is paramatized down to
  //    rely on CSS strings and classes.
  // 3. Define the dragging helper functions, and a few helpers to go with them.
  // 4. Loop through the elements while pairing them off. Every pair gets an
  //    `pair` object, a gutter, and special isFirst/isLast properties.
  // 5. Actually size the pair elements, insert gutters and attach event listeners.
  var Split = function(ids, options) {
    if (options === void 0) options = {};

    var dimension;
    var clientDimension;
    var clientAxis;
    var position;
    var paddingA;
    var paddingB;
    var elements;

    // All DOM elements in the split should have a common parent. We can grab
    // the first elements parent and hope users read the docs because the
    // behavior will be whacky otherwise.
    var parent = elementOrSelector(ids[0]).parentNode;
    var parentFlexDirection = global.getComputedStyle(parent).flexDirection;

    // Set default options.sizes to equal percentages of the parent element.
    var sizes =
      options.sizes ||
      ids.map(function() {
        return 100 / ids.length;
      });

    // Standardize minSize to an array if it isn't already. This allows minSize
    // to be passed as a number.
    var minSize = options.minSize !== undefined ? options.minSize : 100;
    var minSizes = Array.isArray(minSize)
      ? minSize
      : ids.map(function() {
          return minSize;
        });
    var gutterSize = options.gutterSize !== undefined ? options.gutterSize : 10;
    var snapOffset = options.snapOffset !== undefined ? options.snapOffset : 30;
    var direction = options.direction || "horizontal";
    var cursor =
      options.cursor ||
      (direction === "horizontal" ? "ew-resize" : "ns-resize");
    var gutter =
      options.gutter ||
      function(i, gutterDirection) {
        var gut = document.createElement("div");
        gut.className = "gutter gutter-" + gutterDirection;
        return gut;
      };
    var elementStyle =
      options.elementStyle ||
      function(dim, size, gutSize) {
        var style = {};

        if (typeof size !== "string" && !(size instanceof String)) {
          if (!isIE8) {
            style[dim] = calc + "(" + size + "% - " + gutSize + "px)";
          } else {
            style[dim] = size + "%";
          }
        } else {
          style[dim] = size;
        }

        return style;
      };
    var gutterStyle =
      options.gutterStyle ||
      function(dim, gutSize) {
        return (obj = {}), (obj[dim] = gutSize + "px"), obj;
        var obj;
      };

    // 2. Initialize a bunch of strings based on the direction we're splitting.
    // A lot of the behavior in the rest of the library is paramatized down to
    // rely on CSS strings and classes.
    if (direction === "horizontal") {
      dimension = "width";
      clientDimension = "clientWidth";
      clientAxis = "clientX";
      position = "left";
      paddingA = "paddingLeft";
      paddingB = "paddingRight";
    } else if (direction === "vertical") {
      dimension = "height";
      clientDimension = "clientHeight";
      clientAxis = "clientY";
      position = "top";
      paddingA = "paddingTop";
      paddingB = "paddingBottom";
    }

    // 3. Define the dragging helper functions, and a few helpers to go with them.
    // Each helper is bound to a pair object that contains it's metadata. This
    // also makes it easy to store references to listeners that that will be
    // added and removed.
    //
    // Even though there are no other functions contained in them, aliasing
    // this to self saves 50 bytes or so since it's used so frequently.
    //
    // The pair object saves metadata like dragging state, position and
    // event listener references.

    function setElementSize(el, size, gutSize) {
      // Split.js allows setting sizes via numbers (ideally), or if you must,
      // by string, like '300px'. This is less than ideal, because it breaks
      // the fluid layout that `calc(% - px)` provides. You're on your own if you do that,
      // make sure you calculate the gutter size by hand.
      var style = elementStyle(dimension, size, gutSize);

      // eslint-disable-next-line no-param-reassign
      Object.keys(style).forEach(function(prop) {
        return (el.style[prop] = style[prop]);
      });
    }

    function setGutterSize(gutterElement, gutSize) {
      var style = gutterStyle(dimension, gutSize);

      // eslint-disable-next-line no-param-reassign
      Object.keys(style).forEach(function(prop) {
        return (gutterElement.style[prop] = style[prop]);
      });
    }

    // Actually adjust the size of elements `a` and `b` to `offset` while dragging.
    // calc is used to allow calc(percentage + gutterpx) on the whole split instance,
    // which allows the viewport to be resized without additional logic.
    // Element a's size is the same as offset. b's size is total size - a size.
    // Both sizes are calculated from the initial parent percentage,
    // then the gutter size is subtracted.
    function adjust(offset) {
      var a = elements[this.a];
      var b = elements[this.b];
      var percentage = a.size + b.size;

      a.size = offset / this.size * percentage;
      b.size = percentage - offset / this.size * percentage;

      setElementSize(a.element, a.size, this.aGutterSize);
      setElementSize(b.element, b.size, this.bGutterSize);
    }

    // drag, where all the magic happens. The logic is really quite simple:
    //
    // 1. Ignore if the pair is not dragging.
    // 2. Get the offset of the event.
    // 3. Snap offset to min if within snappable range (within min + snapOffset).
    // 4. Actually adjust each element in the pair to offset.
    //
    // ---------------------------------------------------------------------
    // |    | <- a.minSize               ||              b.minSize -> |    |
    // |    |  | <- this.snapOffset      ||     this.snapOffset -> |  |    |
    // |    |  |                         ||                        |  |    |
    // |    |  |                         ||                        |  |    |
    // ---------------------------------------------------------------------
    // | <- this.start                                        this.size -> |
    function drag(e) {
      var offset;

      if (!this.dragging) {
        return;
      }

      // Get the offset of the event from the first side of the
      // pair `this.start`. Supports touch events, but not multitouch, so only the first
      // finger `touches[0]` is counted.
      if ("touches" in e) {
        offset = e.touches[0][clientAxis] - this.start;
      } else {
        offset = e[clientAxis] - this.start;
      }

      // If within snapOffset of min or max, set offset to min or max.
      // snapOffset buffers a.minSize and b.minSize, so logic is opposite for both.
      // Include the appropriate gutter sizes to prevent overflows.
      if (offset <= elements[this.a].minSize + snapOffset + this.aGutterSize) {
        offset = elements[this.a].minSize + this.aGutterSize;
      } else if (
        offset >=
        this.size - (elements[this.b].minSize + snapOffset + this.bGutterSize)
      ) {
        offset = this.size - (elements[this.b].minSize + this.bGutterSize);
      }

      // Actually adjust the size.
      adjust.call(this, offset);

      // Call the drag callback continously. Don't do anything too intensive
      // in this callback.
      if (options.onDrag) {
        options.onDrag();
      }
    }

    // Cache some important sizes when drag starts, so we don't have to do that
    // continously:
    //
    // `size`: The total size of the pair. First + second + first gutter + second gutter.
    // `start`: The leading side of the first element.
    //
    // ------------------------------------------------
    // |      aGutterSize -> |||                      |
    // |                     |||                      |
    // |                     |||                      |
    // |                     ||| <- bGutterSize       |
    // ------------------------------------------------
    // | <- start                             size -> |
    function calculateSizes() {
      // Figure out the parent size minus padding.
      var a = elements[this.a].element;
      var b = elements[this.b].element;

      this.size =
        a[getBoundingClientRect]()[dimension] +
        b[getBoundingClientRect]()[dimension] +
        this.aGutterSize +
        this.bGutterSize;
      this.start = a[getBoundingClientRect]()[position];
    }

    // stopDragging is very similar to startDragging in reverse.
    function stopDragging() {
      var self = this;
      var a = elements[self.a].element;
      var b = elements[self.b].element;

      if (self.dragging && options.onDragEnd) {
        options.onDragEnd();
      }

      self.dragging = false;

      // Remove the stored event listeners. This is why we store them.
      global[removeEventListener]("mouseup", self.stop);
      global[removeEventListener]("touchend", self.stop);
      global[removeEventListener]("touchcancel", self.stop);

      self.parent[removeEventListener]("mousemove", self.move);
      self.parent[removeEventListener]("touchmove", self.move);

      // Delete them once they are removed. I think this makes a difference
      // in memory usage with a lot of splits on one page. But I don't know for sure.
      delete self.stop;
      delete self.move;

      a[removeEventListener]("selectstart", NOOP);
      a[removeEventListener]("dragstart", NOOP);
      b[removeEventListener]("selectstart", NOOP);
      b[removeEventListener]("dragstart", NOOP);

      a.style.userSelect = "";
      a.style.webkitUserSelect = "";
      a.style.MozUserSelect = "";
      a.style.pointerEvents = "";

      b.style.userSelect = "";
      b.style.webkitUserSelect = "";
      b.style.MozUserSelect = "";
      b.style.pointerEvents = "";

      self.gutter.style.cursor = "";
      self.parent.style.cursor = "";
    }

    // startDragging calls `calculateSizes` to store the inital size in the pair object.
    // It also adds event listeners for mouse/touch events,
    // and prevents selection while dragging so avoid the selecting text.
    function startDragging(e) {
      // Alias frequently used variables to save space. 200 bytes.
      var self = this;
      var a = elements[self.a].element;
      var b = elements[self.b].element;

      // Call the onDragStart callback.
      if (!self.dragging && options.onDragStart) {
        options.onDragStart();
      }

      // Don't actually drag the element. We emulate that in the drag function.
      e.preventDefault();

      // Set the dragging property of the pair object.
      self.dragging = true;

      // Create two event listeners bound to the same pair object and store
      // them in the pair object.
      self.move = drag.bind(self);
      self.stop = stopDragging.bind(self);

      // All the binding. `window` gets the stop events in case we drag out of the elements.
      global[addEventListener]("mouseup", self.stop);
      global[addEventListener]("touchend", self.stop);
      global[addEventListener]("touchcancel", self.stop);

      self.parent[addEventListener]("mousemove", self.move);
      self.parent[addEventListener]("touchmove", self.move);

      // Disable selection. Disable!
      a[addEventListener]("selectstart", NOOP);
      a[addEventListener]("dragstart", NOOP);
      b[addEventListener]("selectstart", NOOP);
      b[addEventListener]("dragstart", NOOP);

      a.style.userSelect = "none";
      a.style.webkitUserSelect = "none";
      a.style.MozUserSelect = "none";
      a.style.pointerEvents = "none";

      b.style.userSelect = "none";
      b.style.webkitUserSelect = "none";
      b.style.MozUserSelect = "none";
      b.style.pointerEvents = "none";

      // Set the cursor, both on the gutter and the parent element.
      // Doing only a, b and gutter causes flickering.
      self.gutter.style.cursor = cursor;
      self.parent.style.cursor = cursor;

      // Cache the initial sizes of the pair.
      calculateSizes.call(self);
    }

    // 5. Create pair and element objects. Each pair has an index reference to
    // elements `a` and `b` of the pair (first and second elements).
    // Loop through the elements while pairing them off. Every pair gets a
    // `pair` object, a gutter, and isFirst/isLast properties.
    //
    // Basic logic:
    //
    // - Starting with the second element `i > 0`, create `pair` objects with
    //   `a = i - 1` and `b = i`
    // - Set gutter sizes based on the _pair_ being first/last. The first and last
    //   pair have gutterSize / 2, since they only have one half gutter, and not two.
    // - Create gutter elements and add event listeners.
    // - Set the size of the elements, minus the gutter sizes.
    //
    // -----------------------------------------------------------------------
    // |     i=0     |         i=1         |        i=2       |      i=3     |
    // |             |       isFirst       |                  |     isLast   |
    // |           pair 0                pair 1             pair 2           |
    // |             |                     |                  |              |
    // -----------------------------------------------------------------------
    var pairs = [];
    elements = ids.map(function(id, i) {
      // Create the element object.
      var element = {
        element: elementOrSelector(id),
        size: sizes[i],
        minSize: minSizes[i],
      };

      var pair;

      if (i > 0) {
        // Create the pair object with it's metadata.
        pair = {
          a: i - 1,
          b: i,
          dragging: false,
          isFirst: i === 1,
          isLast: i === ids.length - 1,
          direction: direction,
          parent: parent,
        };

        // For first and last pairs, first and last gutter width is half.
        pair.aGutterSize = gutterSize;
        pair.bGutterSize = gutterSize;

        if (pair.isFirst) {
          pair.aGutterSize = gutterSize / 2;
        }

        if (pair.isLast) {
          pair.bGutterSize = gutterSize / 2;
        }

        // if the parent has a reverse flex-direction, switch the pair elements.
        if (
          parentFlexDirection === "row-reverse" ||
          parentFlexDirection === "column-reverse"
        ) {
          var temp = pair.a;
          pair.a = pair.b;
          pair.b = temp;
        }
      }

      // Determine the size of the current element. IE8 is supported by
      // staticly assigning sizes without draggable gutters. Assigns a string
      // to `size`.
      //
      // IE9 and above
      if (!isIE8) {
        // Create gutter elements for each pair.
        if (i > 0) {
          var gutterElement = gutter(i, direction);
          setGutterSize(gutterElement, gutterSize);

          gutterElement[addEventListener](
            "mousedown",
            startDragging.bind(pair),
          );
          gutterElement[addEventListener](
            "touchstart",
            startDragging.bind(pair),
          );

          parent.insertBefore(gutterElement, element.element);

          pair.gutter = gutterElement;
        }
      }

      // Set the element size to our determined size.
      // Half-size gutters for first and last elements.
      if (i === 0 || i === ids.length - 1) {
        setElementSize(element.element, element.size, gutterSize / 2);
      } else {
        setElementSize(element.element, element.size, gutterSize);
      }

      var computedSize = element.element[getBoundingClientRect]()[dimension];

      if (computedSize < element.minSize) {
        element.minSize = computedSize;
      }

      // After the first iteration, and we have a pair object, append it to the
      // list of pairs.
      if (i > 0) {
        pairs.push(pair);
      }

      return element;
    });

    function setSizes(newSizes) {
      newSizes.forEach(function(newSize, i) {
        if (i > 0) {
          var pair = pairs[i - 1];
          var a = elements[pair.a];
          var b = elements[pair.b];

          a.size = newSizes[i - 1];
          b.size = newSize;

          setElementSize(a.element, a.size, pair.aGutterSize);
          setElementSize(b.element, b.size, pair.bGutterSize);
        }
      });
    }

    function destroy() {
      pairs.forEach(function(pair) {
        pair.parent.removeChild(pair.gutter);
        elements[pair.a].element.style[dimension] = "";
        elements[pair.b].element.style[dimension] = "";
      });
    }

    if (isIE8) {
      return {
        setSizes: setSizes,
        destroy: destroy,
      };
    }

    return {
      setSizes: setSizes,
      getSizes: function getSizes() {
        return elements.map(function(element) {
          return element.size;
        });
      },
      collapse: function collapse(i) {
        if (i === pairs.length) {
          var pair = pairs[i - 1];

          calculateSizes.call(pair);

          if (!isIE8) {
            adjust.call(pair, pair.size - pair.bGutterSize);
          }
        } else {
          var pair$1 = pairs[i];

          calculateSizes.call(pair$1);

          if (!isIE8) {
            adjust.call(pair$1, pair$1.aGutterSize);
          }
        }
      },
      destroy: destroy,
    };
  };

  return Split;
});
