import _ from "lodash";

const DEFAULT_FAVICON = "app/assets/img/favicon.ico";

export const flashFavicon = _.debounce((icon, timeout) => {
  document.querySelector('link[rel="icon"]').setAttribute("href", icon);
  if (timeout) {
    setTimeout(() => {
      document
        .querySelector('link[rel="icon"]')
        .setAttribute("href", DEFAULT_FAVICON);
    }, timeout);
  }
}, 300);

export const resetFavicon = _.debounce((delay = 0) => {
  setTimeout(() => {
    document
      .querySelector('link[rel="icon"]')
      .setAttribute("href", DEFAULT_FAVICON);
  }, delay);
}, 300);
