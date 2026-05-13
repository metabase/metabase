function initMainNav() {
  const productButton = document.getElementById("product-nav-button-desktop");
  const featuresButton = document.getElementById("features-nav-button-desktop");
  const resourcesButton = document.getElementById(
    "resources-nav-button-desktop",
  );

  productButton.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      productButton.classList.toggle("open");
      resourcesButton.classList.remove("open");
      featuresButton.classList.remove("open");
    }
  });
  resourcesButton.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      resourcesButton.classList.toggle("open");
      productButton.classList.remove("open");
      featuresButton.classList.remove("open");
    }
  });
  featuresButton.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      featuresButton.classList.toggle("open");
      productButton.classList.remove("open");
      resourcesButton.classList.remove("open");
    }
  });
}

function initToggleMobileMainNav() {
  const hamburger = document.getElementById("mobile-nav-hamburger-wrapper");
  const mobileNavMenu = document.getElementById("nav-menu-mobile");

  hamburger.addEventListener("click", function() {
    hamburger.classList.toggle("open");
    mobileNavMenu.classList.toggle("d-none");
  });
}

function initResizeMobileMainNav() {
  const navMenuMobile = document.getElementById("nav-menu-mobile");
  let navMenuMobileHeight = 0;

  function setMenuMobileHeight() {
    if (window.innerHeight - 72 !== navMenuMobileHeight) {
      navMenuMobileHeight = window.innerHeight - 72;
      navMenuMobile.style.height = navMenuMobileHeight + "px";
    }
  }
  setMenuMobileHeight();

  window.addEventListener("load", setMenuMobileHeight);
  window.addEventListener("resize", setMenuMobileHeight);
  window.addEventListener("scroll", setMenuMobileHeight);
}

function initNavigationHeaderHoverHighlight() {
  const $navigationHeader = document.querySelector(".navigation-header");
  const $buttons = document.querySelectorAll(".button-desktop");

  setTimeout(() => {
    document.getElementById("hover-highlight").classList.remove("hidden");
  }, 200);

  $buttons.forEach(($button) => {
    $button.addEventListener("mouseenter", function() {
      mainNavHandleHoverHighlight($button);
    });

    $navigationHeader.addEventListener("mouseleave", function() {});
  });
}

function mainNavHandleHoverOnPageLoad() {
  const $button = document.querySelector(".button-desktop:hover");

  if ($button) {
    mainNavHandleHoverHighlight($button);
  }
}

function mainNavHandleHoverHighlight($button) {
  const $hoverHighlight = document.querySelector(
    ".navigation-header #hover-highlight",
  );
  const buttonLeft = $button.offsetLeft;
  const buttonWidth = $button.offsetWidth;
  const buttonHeight = $button.offsetHeight;

  $hoverHighlight.style.left = buttonLeft + "px";
  $hoverHighlight.style.width = buttonWidth + "px";
  $hoverHighlight.style.height = buttonHeight + "px";
}

window.addEventListener("DOMContentLoaded", () => {
  initMainNav();
  initToggleMobileMainNav();
  initResizeMobileMainNav();
  initNavigationHeaderHoverHighlight();
  mainNavHandleHoverOnPageLoad();
});
