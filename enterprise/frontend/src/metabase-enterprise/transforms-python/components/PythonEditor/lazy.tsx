import { Suspense, lazy } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

import type { PythonEditorProps } from "./PythonEditor";

// The completion source pulls in CodeMirror's Python language mode. This plugin
// registers eagerly, so the editor loads on demand instead.
const LazyPythonEditor = lazy(() =>
  import("./PythonEditor").then(({ PythonEditor }) => ({
    default: PythonEditor,
  })),
);

export function PythonEditor(props: PythonEditorProps) {
  return (
    <Suspense fallback={<LoadingAndErrorWrapper loading />}>
      <LazyPythonEditor {...props} />
    </Suspense>
  );
}
