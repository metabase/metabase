import { Suspense, lazy } from "react";

import type { ActionCreatorProps } from "./ActionCreator";

// The action editor carries the native query editor and its CodeMirror
// extensions. Every consumer opens it inside a modal, and one of them is mounted
// with the app shell, so it loads on demand.
const importActionCreator = () => import("./ActionCreator");

/**
 * The editor's chunk, for a caller that wants it in hand before it renders. A
 * `route.lazy` loader awaits this so the modal opens complete, rather than
 * opening around an empty area that fills in a moment later.
 */
export const loadActionCreator = () => importActionCreator();

const LazyActionCreator = lazy(() =>
  importActionCreator().then(({ ActionCreator }) => ({
    default: ActionCreator,
  })),
);

export function ActionCreator(props: ActionCreatorProps) {
  return (
    <Suspense fallback={null}>
      <LazyActionCreator {...props} />
    </Suspense>
  );
}
