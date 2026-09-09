import { Suspense, lazy } from "react";

import type { PythonTransformEditorProps } from "metabase/plugins";

// The plugin registry holds this component from boot, so registering the real
// one would put the Python editor and its CodeMirror extensions in the initial
// bundle no matter which route the user is on. The registry holds this stand-in
// instead, and the editor loads when a Python transform is actually opened.
const LazyPythonTransformEditor = lazy(() =>
  import(
    /* webpackChunkName: "python-transform-editor" */ "./PythonTransformEditor"
  ).then(({ PythonTransformEditor }) => ({
    default: PythonTransformEditor,
  })),
);

export function PythonTransformEditor(props: PythonTransformEditorProps) {
  return (
    <Suspense fallback={null}>
      <LazyPythonTransformEditor {...props} />
    </Suspense>
  );
}
