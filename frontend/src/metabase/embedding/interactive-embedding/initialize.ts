import { push } from "react-router-redux";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { setInitialUrlOptions } from "metabase/redux/embed";
import type { Dispatch } from "metabase/redux/store";
import { isWithinIframe } from "metabase/utils/iframe";

export type FrameSpec = {
  mode: "normal" | "fit";
  height: number;
};

export function initializeInteractiveEmbedding(dispatch: Dispatch) {
  if (isWithinIframe()) {
    let currentHref: string | undefined;
    let currentFrame: FrameSpec | undefined;

    // NOTE: history.listen and window's onhashchange + popstate events were not
    // enough to catch all URL changes, so just poll for now :(
    setInterval(() => {
      const location = window.location;
      if (currentHref !== location.href) {
        sendMessage({
          type: "location",
          // extract just the string properties from window.location
          location: _.pick(location, (v) => typeof v === "string"),
        });
        currentHref = location.href;
      }
      const frame = getFrameSpec();
      if (!_.isEqual(currentFrame, frame)) {
        sendMessage({ type: "frame", frame });
        currentFrame = frame;
      }
    }, 100);
    window.addEventListener("message", (e) => {
      if (e.source === window.parent && e.data.metabase) {
        if (e.data.metabase.type === "location") {
          dispatch(push(e.data.metabase.location));
        }
      }
    });
    dispatch(setInitialUrlOptions(window.location));
  }
}

type LocationMessage = {
  type: "location";
  location: Partial<Location>;
};

type FrameMessage = {
  type: "frame";
  frame: FrameSpec;
};

type Message = LocationMessage | FrameMessage;

function sendMessage(message: Message) {
  // Reason for using "*" (see #18824)
  //  1) We cannot use MetabaseSettings.get("embedding-app-origin") because the format is different
  //      - the setting value can have multiple URLs but postMessage only supports one URL
  //      - the setting value support wildcard in subdomain but postMessage does not
  //  2) The risk should be very low because
  //      - the data we sent is not sensitive data (frame size, current URL)
  //      - we are already using frame ancestor policy to limit domains that can embed metabase
  window.parent.postMessage({ metabase: message }, "*");
}

function isFitViewportMode() {
  const root = document.getElementById("root");

  // get the first div, which may be preceded by style nodes
  const firstChild = root?.querySelector("div");

  if (firstChild) {
    return firstChild.classList.contains(CS.spread);
  }
  return false;
}

function getFrameSpec(): FrameSpec {
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
    document.querySelector<HTMLElement>(
      "[data-element-id=dashboard-header-container]",
    )?.offsetHeight ?? 0;
  const dashboardContentHeight =
    document.querySelector("[data-element-id=dashboard-parameters-and-cards]")
      ?.scrollHeight ?? 0;
  const dashboardHeight = dashboardHeaderHeight + dashboardContentHeight;

  if (dashboardHeight > 0) {
    return appBarHeight + dashboardHeight;
  }

  return defaultGetScrollHeight();
}
