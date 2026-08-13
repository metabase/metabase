import { Suspense, lazy } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

import type { NativeQueryModalProps } from "./NativeQueryModal";

// The modal carries the native query editor and its CodeMirror extensions.
// Documents render on public pages, so keeping this behind a boundary keeps the
// editor out of every entry's initial load.
const LazyNativeQueryModal = lazy(() =>
  import("./NativeQueryModal").then(({ NativeQueryModal }) => ({
    default: NativeQueryModal,
  })),
);

export const NativeQueryModal = (props: NativeQueryModalProps) => (
  <Suspense fallback={<LoadingAndErrorWrapper loading />}>
    <LazyNativeQueryModal {...props} />
  </Suspense>
);
