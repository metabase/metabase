import type { Connect } from "vite";

import { DATA_APP_BUNDLE_URL } from "../../constants/bundle";
import type { AppBundle } from "../app-bundle";

/** Serves the in-memory app bundle the sandbox fetches and evaluates. */
export const getAppBundleMiddleware =
  (bundle: AppBundle): Connect.NextHandleFunction =>
  (req, res, next) => {
    if (req.url?.split("?")[0] !== DATA_APP_BUNDLE_URL) {
      next();

      return;
    }

    if (!bundle.code) {
      res.statusCode = 503;
      res.setHeader("Content-Type", "text/plain");
      res.end("data-app bundle is not built — see the dev server logs.");

      return;
    }

    res.setHeader("Content-Type", "text/javascript");
    res.end(bundle.code);
  };
