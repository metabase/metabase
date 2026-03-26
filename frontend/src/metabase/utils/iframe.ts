import { isCypressActive, isStorybookActive } from "metabase/env";

// denotes whether the current page is loaded in an iframe or not
// Cypress renders the whole app within an iframe, but we want to exclude it from this check to avoid certain components (like Nav bar) not rendering
// Storybook also uses an iframe to display story content, so we want to ignore it
export const isWithinIframe = function (): boolean {
  try {
    // Mock that we're embedding, so we could test embed components
    if (window.overrideIsWithinIframe) {
      return true;
    }

    if (isCypressActive || isStorybookActive) {
      return false;
    }

    return window.self !== window.top;
  } catch (e) {
    return true;
  }
};

// add a global so we can check if the parent iframe is Metabase
window.METABASE = true;

// check that we're both iframed, and the parent is a Metabase instance
// used for detecting if we're previewing an embed
export const IFRAMED_IN_SELF = (function () {
  try {
    return window.self !== window.parent && Boolean(window.parent.METABASE);
  } catch (e) {
    return false;
  }
})();
