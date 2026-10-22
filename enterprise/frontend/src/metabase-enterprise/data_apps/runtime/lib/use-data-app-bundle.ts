import { type ComponentType, useEffect, useState } from "react";
import { t } from "ttag";

import type { DataAppMetabaseProviderProps } from "metabase-enterprise/data_apps/sandbox/types";

import {
  DataAppBundleError,
  fetchDataAppBundleCode,
  instantiateDataAppBundle,
} from "../loader";

import { describeError } from "./describe-error";
import { reportErrorToParent } from "./report-error-to-parent";

export interface LoadedApp {
  component: ComponentType<Record<string, unknown>>;
  providerProps: DataAppMetabaseProviderProps;
}

/**
 * Loads a data-app bundle in the near-membrane sandbox and watches for crashes.
 *
 * Embedded apps install CSP before creating the sandbox. Errors are
 * reported to the host's `DataAppView` for internal data apps.
 */
export const useDataAppBundle = (
  name: string,
  { embedded = false }: { embedded?: boolean } = {},
): {
  data: LoadedApp | null;
  failed: boolean;
} => {
  const [data, setData] = useState<LoadedApp | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    setData(null);
    setFailed(false);

    const load = async () => {
      const { code, allowedHosts, contentSecurityPolicy } =
        await fetchDataAppBundleCode(name);

      if (cancelled) {
        return;
      }

      // Install CSP before creating the sandbox or evaluating any bundle code.
      if (embedded) {
        installContentSecurityPolicy(contentSecurityPolicy);
      }

      const { component, providerProps } = await instantiateDataAppBundle(
        code,
        name,
        window,
        allowedHosts,
      );

      if (cancelled) {
        return;
      }

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
  }, [name, embedded]);

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
};

/**
 * CSP contains allowed hosts which we don't want to expose without auth.
 * We do client-side auth first, then fetch and inject the CSP next.
 */
function installContentSecurityPolicy(policy: string | null | undefined) {
  if (!policy?.trim()) {
    console.error("CSP is missing from the data app bundle's response.");

    throw new Error(
      t`Something went wrong while loading this app. Try refreshing the page.`,
    );
  }

  const meta = document.createElement("meta");
  meta.httpEquiv = "Content-Security-Policy";
  meta.content = policy;

  document.head.appendChild(meta);
}
