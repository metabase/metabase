/*
 * This file is subject to the terms and conditions defined in
 * file 'LICENSE-EMBEDDING.txt', which is part of this source code package.
 */

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";

import "regenerator-runtime/runtime";

import "metabase/lib/dayjs";

// If enabled this monkeypatches `t` and `jt` to return blacked out
// strings/elements to assist in finding untranslated strings.
import "metabase/lib/i18n-debug";

// set the locale before loading anything else
import "metabase/lib/i18n";

// NOTE: why do we need to load this here?
import "metabase/lib/colors";

// NOTE: this loads all builtin plugins
import "metabase/plugins/builtin";

// This is conditionally aliased in the webpack config.
// If EE isn't enabled, it loads an empty file.
import "ee-plugins"; // eslint-disable-line import/no-duplicates

import { createRoot } from "react-dom/client";

import { isWithinIframe } from "metabase/lib/dom";
import { captureConsoleErrors } from "metabase/lib/errors";
import { SdkIframeEmbedRoute } from "metabase-enterprise/embedding_iframe_sdk/components/SdkIframeEmbedRoute/SdkIframeEmbedRoute";

// eslint-disable-next-line no-console -- for debugging only
console.log("app-embed-sdk entry point");

function _init() {
  const root = createRoot(document.getElementById("root"));
  root.render(<SdkIframeEmbedRoute />);

  if (isWithinIframe()) {
    document.body.style.backgroundColor = "transparent";
  }
}

captureConsoleErrors();

if (document.readyState !== "loading") {
  _init();
} else {
  document.addEventListener("DOMContentLoaded", _init);
}
