import { push } from "react-router-redux";
import _ from "underscore";

import { isFitViewportMode } from "metabase/hoc/FitViewPort";
import { isWithinIframe, IFRAMED_IN_SELF } from "metabase/lib/dom";
import { setInitialUrlOptions } from "metabase/redux/embed";

// detect if this page is embedded in itself, i.e. it's a embed preview
// will need to do something different if we ever embed metabase in itself for another reason
export const IS_EMBED_PREVIEW = IFRAMED_IN_SELF;

export function initializeEmbedding(store) {
  if (isWithinIframe()) {
    let currentHref;
    let currentFrame;
    // NOTE: history.listen and window's onhashchange + popstate events were not
    // enough to catch all URL changes, so just poll for now :(
    setInterval(() => {
      const location = window.location;
      if (currentHref !== location.href) {
        sendMessage({
          type: "location",
          // extract just the string properties from window.location
          location: _.pick(location, v => typeof v === "string"),
        });
        currentHref = location.href;
      }
      const frame = getFrameSpec();
      if (!_.isEqual(currentFrame, frame)) {
        sendMessage({
          type: "frame",
          frame: frame,
        });
        currentFrame = frame;
      }
    }, 100);
    window.addEventListener("message", e => {
      if (e.source === window.parent && e.data.metabase) {
        if (e.data.metabase.type === "location") {
          store.dispatch(push(e.data.metabase.location));
        }
      }
    });

    store.dispatch(setInitialUrlOptions(window.location));
  }
}

function sendMessage(message) {
  // Reason for using "*" (see #18824)
  //  1) We cannot use MetabaseSettings.get("embedding-app-origin") because the format is different
  //      - the setting value can have multiple URLs but postMessage only supports one URL
  //      - the setting value support wildcard in subdomain but postMessage does not
  //  2) The risk should be very low because
  //      - the data we sent is not sensitive data (frame size, current URL)
  //      - we are already using frame ancestor policy to limit domains that can embed metabase
  window.parent.postMessage({ metabase: message }, "*");
}

function getFrameSpec() {
  if (isFitViewportMode()) {
    return { mode: "fit", height: getScrollHeight() };
  } else {
    return { mode: "normal", height: document.body.scrollHeight };
  }
}

function defaultGetScrollHeight() {
  return document.body.scrollHeight;
}

function getScrollHeight() {
  const appBarHeight =
    document.getElementById("[data-element-id=app-bar]")?.offsetHeight ?? 0;
  const dashboardHeaderHeight =
    document.querySelector("[data-element-id=dashboard-header-container]")
      ?.offsetHeight ?? 0;
  const dashboardContentHeight =
    document.querySelector("[data-element-id=dashboard-parameters-and-cards]")
      ?.scrollHeight ?? 0;
  const dashboardHeight = dashboardHeaderHeight + dashboardContentHeight;

  if (dashboardHeight > 0) {
    return appBarHeight + dashboardHeight;
  }

  return defaultGetScrollHeight();
}
