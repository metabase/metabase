import { Suspense, lazy } from "react";

import type { CodeEditorProps } from "./CodeEditor";

// CodeMirror and its language modes are among the largest dependencies in the
// app bundle. Loading the editor lazily keeps all of them out of the initial
// page load, since no route renders a code editor on first paint.
//
// Nothing renders while it loads. The chunk is shared and cached after its first
// use, so only the first editor in a session waits, and showing the code
// uncoloured for that moment reads as a glitch rather than as progress.
const LazyCodeEditor = lazy(() =>
  import(
    /* webpackChunkName: "code-editor" */
    "./CodeEditor"
  ).then(({ CodeEditor }) => ({ default: CodeEditor })),
);

export function CodeEditor(props: CodeEditorProps) {
  return (
    <Suspense fallback={null}>
      <LazyCodeEditor {...props} />
    </Suspense>
  );
}
