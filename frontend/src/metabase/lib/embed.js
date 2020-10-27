import { push } from "react-router-redux";

import _ from "underscore";

import { IFRAMED, IFRAMED_IN_SELF } from "metabase/lib/dom";
import MetabaseSettings from "metabase/lib/settings";

import { isFitViewportMode } from "metabase/hoc/FitViewPort";

// detect if this page is embedded in itself, i.e. it's a embed preview
// will need to do something different if we ever embed metabase in itself for another reason
export const IS_EMBED_PREVIEW = IFRAMED_IN_SELF;

export function initializeEmbedding(store) {
  if (IFRAMED) {
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
  }
}

function sendMessage(message) {
  window.parent.postMessage(
    { metabase: message },
    MetabaseSettings.get("embedding-app-origin"),
  );
}

function getFrameSpec() {
  if (isFitViewportMode()) {
    return { mode: "fit" };
  } else {
    return { mode: "normal", height: document.body.scrollHeight };
  }
}
