import { Suspense, lazy } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

import type { PythonEditorBodyProps } from "./PythonEditorBody";

// PythonTransformEditor is registered on the plugin object at startup, so
// without this boundary its CodeMirror extensions load with the app shell.
const LazyPythonEditorBody = lazy(() =>
  import("./PythonEditorBody").then(({ PythonEditorBody }) => ({
    default: PythonEditorBody,
  })),
);

export function PythonEditorBody(props: PythonEditorBodyProps) {
  return (
    <Suspense fallback={<LoadingAndErrorWrapper loading />}>
      <LazyPythonEditorBody {...props} />
    </Suspense>
  );
}
