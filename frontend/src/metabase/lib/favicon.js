import _ from "lodash";
import MetabaseSettings from "./settings";

const DEFAULT_FAVICON = MetabaseSettings.get("application-favicon-url");
export const LOAD_COMPLETE_FAVICON = "app/assets/img/blue_check.png";

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
