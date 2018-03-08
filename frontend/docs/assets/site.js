/* global anchors */

// add anchor links to headers
anchors.options.placement = "left";
anchors.add("h3");

// Filter UI
var tocElements = document.getElementById("toc").getElementsByTagName("li");

document.getElementById("filter-input").addEventListener("keyup", function(e) {
  var i, element, children;

  // enter key
  if (e.keyCode === 13) {
    // go to the first displayed item in the toc
    for (i = 0; i < tocElements.length; i++) {
      element = tocElements[i];
      if (!element.classList.contains("display-none")) {
        location.replace(element.firstChild.href);
        return e.preventDefault();
      }
    }
  }

  var match = function() {
    return true;
  };

  var value = this.value.toLowerCase();

  if (!value.match(/^\s*$/)) {
    match = function(element) {
      var html = element.firstChild.innerHTML;
      return html && html.toLowerCase().indexOf(value) !== -1;
    };
  }

  for (i = 0; i < tocElements.length; i++) {
    element = tocElements[i];
    children = Array.from(element.getElementsByTagName("li"));
    if (match(element) || children.some(match)) {
      element.classList.remove("display-none");
    } else {
      element.classList.add("display-none");
    }
  }
});

var items = document.getElementsByClassName("toggle-sibling");
for (var j = 0; j < items.length; j++) {
  items[j].addEventListener("click", toggleSibling);
}

function toggleSibling() {
  var stepSibling = this.parentNode.getElementsByClassName("toggle-target")[0];
  var icon = this.getElementsByClassName("icon")[0];
  var klass = "display-none";
  if (stepSibling.classList.contains(klass)) {
    stepSibling.classList.remove(klass);
    icon.innerHTML = "▾";
  } else {
    stepSibling.classList.add(klass);
    icon.innerHTML = "▸";
  }
}

function showHashTarget(targetId) {
  if (targetId) {
    var hashTarget = document.getElementById(targetId);
    // new target is hidden
    if (
      hashTarget &&
      hashTarget.offsetHeight === 0 &&
      hashTarget.parentNode.parentNode.classList.contains("display-none")
    ) {
      hashTarget.parentNode.parentNode.classList.remove("display-none");
    }
  }
}

function scrollIntoView(targetId) {
  // Only scroll to element if we don't have a stored scroll position.
  if (targetId && !history.state) {
    var hashTarget = document.getElementById(targetId);
    if (hashTarget) {
      hashTarget.scrollIntoView();
    }
  }
}

function gotoCurrentTarget() {
  showHashTarget(location.hash.substring(1));
  scrollIntoView(location.hash.substring(1));
}

window.addEventListener("hashchange", gotoCurrentTarget);
gotoCurrentTarget();

var toclinks = document.getElementsByClassName("pre-open");
for (var k = 0; k < toclinks.length; k++) {
  toclinks[k].addEventListener("mousedown", preOpen, false);
}

function preOpen() {
  showHashTarget(this.hash.substring(1));
}

var split_left = document.querySelector("#split-left");
var split_right = document.querySelector("#split-right");
var split_parent = split_left.parentNode;
var cw_with_sb = split_left.clientWidth;
split_left.style.overflow = "hidden";
var cw_without_sb = split_left.clientWidth;
split_left.style.overflow = "";

Split(["#split-left", "#split-right"], {
  elementStyle: function(dimension, size, gutterSize) {
    return {
      "flex-basis": "calc(" + size + "% - " + gutterSize + "px)",
    };
  },
  gutterStyle: function(dimension, gutterSize) {
    return {
      "flex-basis": gutterSize + "px",
    };
  },
  gutterSize: 20,
  sizes: [33, 67],
});

// Chrome doesn't remember scroll position properly so do it ourselves.
// Also works on Firefox and Edge.

function updateState() {
  history.replaceState(
    {
      left_top: split_left.scrollTop,
      right_top: split_right.scrollTop,
    },
    document.title,
  );
}

function loadState(ev) {
  if (ev) {
    // Edge doesn't replace change history.state on popstate.
    history.replaceState(ev.state, document.title);
  }
  if (history.state) {
    split_left.scrollTop = history.state.left_top;
    split_right.scrollTop = history.state.right_top;
  }
}

window.addEventListener("load", function() {
  // Restore after Firefox scrolls to hash.
  setTimeout(function() {
    loadState();
    // Update with initial scroll position.
    updateState();
    // Update scroll positions only after we've loaded because Firefox
    // emits an initial scroll event with 0.
    split_left.addEventListener("scroll", updateState);
    split_right.addEventListener("scroll", updateState);
  }, 1);
});

window.addEventListener("popstate", loadState);
