import { type RefObject, useCallback, useMemo, useRef } from "react";
import { useLatest } from "react-use";
import { match } from "ts-pattern";

import {
  type DataAppFrameNavigationEvent,
  createDataAppFrameNavigation,
  reduceDataAppFrameNavigation,
} from "embedding-sdk-bundle/lib/data-apps/data-app-frame-navigation";

type Options = {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  origin: string;
  slug: string;
  initialPath: string;
  isPathControlled: boolean;
  onPathChange: ((path: string) => void) | undefined;
};

type PathReport = { path: string; navigationId?: number };

/**
 * Keeps the data app iframe's page and the host's `path` in sync.
 *
 * The returned handlers are stable, so effects that depend on them do not resend the settings.
 */
export function useDataAppFrameNavigation({
  iframeRef,
  origin,
  slug,
  initialPath,
  isPathControlled,
  onPathChange,
}: Options) {
  const stateRef = useRef(createDataAppFrameNavigation(initialPath));

  // Latest values, so an inline callback does not re-send the settings on every render.
  const latestRef = useLatest({ origin, slug, isPathControlled, onPathChange });

  const dispatch = useCallback(
    (event: DataAppFrameNavigationEvent) => {
      const { state, command } = reduceDataAppFrameNavigation(
        stateRef.current,
        event,
      );

      stateRef.current = state;

      match(command)
        .with({ type: "navigateIframe" }, ({ path, navigationId }) =>
          iframeRef.current?.contentWindow?.postMessage(
            {
              type: "metabase.embed.navigateToDataAppPath",
              data: { path, navigationId },
            },
            latestRef.current.origin,
          ),
        )
        .with({ type: "reportPath" }, ({ path }) =>
          latestRef.current.onPathChange?.(path),
        )
        .with(null, () => undefined)
        .exhaustive();
    },
    [iframeRef, latestRef],
  );

  return useMemo(
    () => ({
      initialPath: stateRef.current.initialPath,
      isIframeReady: () => stateRef.current.isReady,

      handleIframeReady: (hostPath: string) =>
        dispatch({ type: "iframeReady", hostPath }),

      handleIframeLost: () => dispatch({ type: "iframeLost" }),

      handlePathReport: (
        { path, navigationId }: PathReport,
        hostPath: string,
      ) =>
        dispatch({
          type: "pathReported",
          path,
          navigationId,
          slug: latestRef.current.slug,
          hostPath,
          isPathControlled: latestRef.current.isPathControlled,
          hasOnPathChange: latestRef.current.onPathChange !== undefined,
        }),

      handleHostPathChange: (hostPath: string, isPathControlled: boolean) =>
        dispatch({ type: "hostPathChanged", hostPath, isPathControlled }),
    }),
    [dispatch, latestRef],
  );
}
