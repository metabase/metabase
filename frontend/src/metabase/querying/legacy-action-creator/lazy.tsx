import { Suspense, lazy } from "react";

import type { LegacyActionCreatorProps } from "./ActionCreator";

// The action editor carries the native query editor and its CodeMirror
// extensions. Every consumer opens it inside a modal, and one of them is mounted
// with the app shell, so it loads on demand.
const importLegacyActionCreator = () => import("./ActionCreator");

/**
 * The editor's chunk, for a caller that wants it in hand before it renders. A
 * `route.lazy` loader awaits this so the modal opens complete, rather than
 * opening around an empty area that fills in a moment later.
 */
export const loadLegacyActionCreator = () => importLegacyActionCreator();

const LazyLegacyActionCreator = lazy(() =>
  importLegacyActionCreator().then(({ LegacyActionCreator }) => ({
    default: LegacyActionCreator,
  })),
);

export function LegacyActionCreator(props: LegacyActionCreatorProps) {
  return (
    <Suspense fallback={null}>
      <LazyLegacyActionCreator {...props} />
    </Suspense>
  );
}
