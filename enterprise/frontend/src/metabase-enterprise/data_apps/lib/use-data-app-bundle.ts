import { type ComponentType, useEffect, useState } from "react";

import {
  DataAppBundleError,
  fetchDataAppBundleCode,
  instantiateDataAppBundle,
} from "../loader";
import type { DataAppMetabaseProviderProps } from "../sandbox";

import { describeError } from "./describe-error";
import { reportErrorToParent } from "./report-error-to-parent";

export interface LoadedApp {
  component: ComponentType<Record<string, unknown>>;
  providerProps: DataAppMetabaseProviderProps;
}

/**
 * Loads a data-app bundle by name and supervises it: fetches the bundle code,
 * instantiates it inside the Near-Membrane sandbox, and watches for uncaught
 * crashes. Any failure is reported up to the host `AppView` (which owns the
 * themed failure screen); the returned `failed` flag only gates what the iframe
 * renders in the meantime (the bundle vs. a neutral loader).
 */
export function useDataAppBundle(name: string): {
  data: LoadedApp | null;
  failed: boolean;
} {
  const [data, setData] = useState<LoadedApp | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setData(null);
    setFailed(false);

    const load = async () => {
      const code = await fetchDataAppBundleCode(name);

      if (cancelled) {
        return;
      }

      const { component, providerProps } = instantiateDataAppBundle(
        code,
        name,
        window,
      );

      setData({ component, providerProps });
    };

    load().catch((error: unknown) => {
      if (!cancelled) {
        const notReady =
          error instanceof DataAppBundleError && error.status === 404;
        // A 404 (not-yet-synced) is expected, so we keep the friendly message;
        // any other failure carries the real error so it can be shown.
        const detail = notReady ? undefined : describeError(error);
        setFailed(true);
        reportErrorToParent(notReady, detail);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [name]);

  useEffect(() => {
    // The bundle runs in a Near-Membrane sandbox that can throw errors which
    // escape React's render cycle (e.g. an opaque `#<Object>` from the membrane)
    // and so slip past `BundleErrorBoundary`, leaving a blank frame. Catch
    // genuine uncaught JS errors at the window level and show the error screen.
    // `event.error == null` for resource-load errors, which we ignore.
    const onError = (event: ErrorEvent) => {
      if (event.error != null) {
        const detail = describeError(event.error, event.message);
        // Log the unpacked message/stack so devtools shows the real error
        // instead of the membrane's opaque `#<Object>`.
        console.error(
          "[data-app] uncaught error in the bundle:",
          detail.message,
          detail.stack ?? "",
        );
        setFailed(true);
        reportErrorToParent(false, detail);
      }
    };

    window.addEventListener("error", onError);

    return () => window.removeEventListener("error", onError);
  }, []);

  return { data, failed };
}
