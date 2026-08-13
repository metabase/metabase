import { Suspense, lazy } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

import type { ActionCreatorProps } from "./ActionCreator";

// The action editor carries the native query editor and its CodeMirror
// extensions. Every consumer opens it as a modal, and one of them is mounted
// with the app shell, so it loads on demand.
const LazyActionCreator = lazy(() =>
  import("./ActionCreator").then(({ ActionCreator }) => ({
    default: ActionCreator,
  })),
);

export function ActionCreator(props: ActionCreatorProps) {
  return (
    <Suspense fallback={<LoadingAndErrorWrapper loading />}>
      <LazyActionCreator {...props} />
    </Suspense>
  );
}
