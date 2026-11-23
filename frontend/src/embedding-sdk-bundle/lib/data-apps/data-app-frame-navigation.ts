import { match } from "ts-pattern";

import { getEmbeddedAppSlugFromPath } from "embedding-sdk-shared/data-apps/embedded-data-app-path";

/** What the host knows about the data app iframe's page. */
export interface DataAppFrameNavigation {
  /** The path the iframe first loads. Settings always carry it, so resending them never moves the app. */
  initialPath: string;

  /** Requests sent before the iframe is ready are lost, so the iframe is navigated once it is. */
  isReady: boolean;

  /** The page the iframe is on, as far as the host knows: the last path it reported or was asked to show. */
  iframePath: string;

  /**
   * Paths reported to `onPathChange` that have not come back as `path` yet. A host may apply them late,
   * after the user has moved on, so they are echoes to skip rather than pages to navigate to.
   */
  reportedPaths: string[];

  /**
   * Navigation requests are numbered, and the iframe reports the last one it handled.
   * A report with another number was sent before the iframe handled the latest request, which moves it away.
   * The count keeps going up across iframes, so a report from an earlier iframe never matches.
   */
  navigationCount: number;
  expectedNavigationId: number | undefined;
}

export type DataAppFrameNavigationEvent =
  | { type: "iframeReady"; hostPath: string }
  | { type: "iframeLost" }
  | {
      type: "pathReported";
      path: string;
      navigationId: number | undefined;
      slug: string;
      hostPath: string;
      isPathControlled: boolean;
      hasOnPathChange: boolean;
    }
  | { type: "hostPathChanged"; hostPath: string; isPathControlled: boolean };

export type DataAppFrameNavigationCommand =
  | { type: "navigateIframe"; path: string; navigationId: number }
  | { type: "reportPath"; path: string };

interface Transition {
  state: DataAppFrameNavigation;
  command: DataAppFrameNavigationCommand | null;
}

export const createDataAppFrameNavigation = (
  initialPath: string,
): DataAppFrameNavigation => ({
  initialPath,
  isReady: false,
  iframePath: initialPath,
  reportedPaths: [],
  navigationCount: 0,
  expectedNavigationId: undefined,
});

/** The next navigation state for an event, and what the host should do. */
export const reduceDataAppFrameNavigation = (
  state: DataAppFrameNavigation,
  event: DataAppFrameNavigationEvent,
): Transition =>
  match(event)
    .with({ type: "iframeReady" }, ({ hostPath }) => {
      // A new iframe opens the initial path and has handled no navigation requests yet.
      const readyState: DataAppFrameNavigation = {
        ...state,
        isReady: true,
        iframePath: state.initialPath,
        reportedPaths: [],
        expectedNavigationId: undefined,
      };

      return hostPath === readyState.iframePath
        ? { state: readyState, command: null }
        : navigateIframe(readyState, hostPath);
    })
    .with({ type: "iframeLost" }, () => ({
      // The next iframe sends its own ready message.
      state: { ...state, isReady: false },
      command: null,
    }))
    .with({ type: "pathReported" }, (report) => handlePathReport(state, report))
    .with({ type: "hostPathChanged" }, ({ hostPath, isPathControlled }) =>
      handleHostPathChange(state, hostPath, isPathControlled),
    )
    .exhaustive();

const navigateIframe = (
  state: DataAppFrameNavigation,
  path: string,
): Transition => {
  const nextState = { ...state, iframePath: path, reportedPaths: [] };

  // Before the iframe is ready, it navigates to the host's path once it is.
  if (!state.isReady) {
    return { state: nextState, command: null };
  }

  const navigationId = state.navigationCount + 1;

  return {
    state: {
      ...nextState,
      navigationCount: navigationId,
      expectedNavigationId: navigationId,
    },
    command: { type: "navigateIframe", path, navigationId },
  };
};

const handlePathReport = (
  state: DataAppFrameNavigation,
  {
    path,
    navigationId,
    slug,
    hostPath,
    isPathControlled,
    hasOnPathChange,
  }: Extract<DataAppFrameNavigationEvent, { type: "pathReported" }>,
): Transition => {
  // The iframe handles the latest request next, so this page is already left behind.
  if (navigationId !== state.expectedNavigationId) {
    return { state, command: null };
  }

  // `path` cannot name this page, so `onPathChange={setPath}` would break the embed. Send the app
  // back to the host's path instead, or the host could not navigate to that path again.
  if (getEmbeddedAppSlugFromPath(path) !== slug) {
    return isPathControlled
      ? navigateIframe(state, hostPath)
      : { state: { ...state, iframePath: path }, command: null };
  }

  const reportedPaths = match({ path, isPathControlled, hasOnPathChange })
    // The host's `path` already names this page, so it will not change, and the earlier reports
    // will not come back. Keeping them would treat a later host navigation to one as an echo.
    .with({ path: hostPath }, () => [])
    .with({ isPathControlled: true, hasOnPathChange: true }, () => [
      ...state.reportedPaths,
      path,
    ])
    .otherwise(() => state.reportedPaths);

  return {
    state: { ...state, iframePath: path, reportedPaths },
    command: { type: "reportPath", path },
  };
};

// With `initialPath` only, the host does not navigate the app. When the host starts passing `path`, the app goes to it.
const handleHostPathChange = (
  state: DataAppFrameNavigation,
  hostPath: string,
  isPathControlled: boolean,
): Transition => {
  if (!isPathControlled) {
    // Reports are only queued while the host passes `path`, so none of these can come back as an echo.
    return { state: { ...state, reportedPaths: [] }, command: null };
  }

  if (hostPath === state.iframePath) {
    return { state: { ...state, reportedPaths: [] }, command: null };
  }

  const reportedIndex = state.reportedPaths.indexOf(hostPath);

  // The host applied a path the iframe reported, so it is an echo, along with every report before it.
  if (reportedIndex !== -1) {
    return {
      state: {
        ...state,
        reportedPaths: state.reportedPaths.slice(reportedIndex + 1),
      },
      command: null,
    };
  }

  return navigateIframe(state, hostPath);
};
