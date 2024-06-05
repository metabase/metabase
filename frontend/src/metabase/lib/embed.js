import { push } from "react-router-redux";
import _ from "underscore";

import { isFitViewportMode } from "metabase/hoc/FitViewPort";
import { parseSearchOptions, parseHashOptions } from "metabase/lib/browser";
import { isWithinIframe, IFRAMED_IN_SELF } from "metabase/lib/dom";
import {
  setOptions,
  toggleChartExplainer,
  toggleDashboardSummarizer,
  toggleCopyToWorkspace,
} from "metabase/redux/embed";

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
      } else if (e.data.lighthouse) {
        if (
          e.data.lighthouse?.type === "FeatureToggles" &&
          e.data.lighthouse?.payload
        ) {
          if ("enableChartExplainer" in e.data.lighthouse.payload) {
            const { enableChartExplainer: enable_chart_explainer } =
              e.data.lighthouse.payload;
            store.dispatch(toggleChartExplainer({ enable_chart_explainer }));
          }
          if ("enableDashboardSummarizer" in e.data.lighthouse.payload) {
            const { enableDashboardSummarizer: enable_dashboard_summarizer } =
              e.data.lighthouse.payload;
            store.dispatch(
              toggleDashboardSummarizer({ enable_dashboard_summarizer }),
            );
          }
        }
      } else if (e.data.pipelines) {
        if (
          e.data.pipelines?.type === "FeatureToggles" &&
          e.data.pipelines?.payload
        ) {
          if ("enableCopyToWorkspace" in e.data.pipelines.payload) {
            const { enableCopyToWorkspace: enable_copy_to_workspace } =
              e.data.pipelines.payload;
            store.dispatch(
              toggleCopyToWorkspace({
                enable_copy_to_workspace,
              }),
            );
          }
        }
      }
    });
    store.dispatch(
      setOptions({
        ...parseSearchOptions(window.location.search),
        ...parseHashOptions(window.location.hash),
      }),
    );
    window.parent.postMessage({ lighthouse: { type: "FeatureToggles" } }, "*");
    window.parent.postMessage({ pipelines: { type: "FeatureToggles" } }, "*");
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
    return { mode: "fit", height: document.body.scrollHeight };
  } else {
    return { mode: "normal", height: document.body.scrollHeight };
  }
}
