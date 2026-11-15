import { Suspense, lazy } from "react";

import type { CodeEditorProps } from "./CodeEditor";

// CodeMirror and its language modes are among the largest dependencies in the
// app bundle. Loading the editor lazily keeps all of them out of the initial
// page load, since no route renders a code editor on first paint.
//
// Nothing renders while it loads. The chunk is shared and cached after its first
// use, so only the first editor in a session waits, and showing the code
// uncoloured for that moment reads as a glitch rather than as progress.
const importCodeEditor = () =>
  import(
    /* webpackChunkName: "code-editor" */
    "./CodeEditor"
  );

/**
 * The editor's chunk, for a caller that wants it in hand before it renders.
 * A `route.lazy` loader can await this so its page or modal only appears once
 * the editor is ready, rather than appearing with an empty editor area.
 */
export const loadCodeEditor = () => importCodeEditor();

const LazyCodeEditor = lazy(() =>
  importCodeEditor().then(({ CodeEditor }) => ({ default: CodeEditor })),
);

export function CodeEditor(props: CodeEditorProps) {
  return (
    <Suspense fallback={null}>
      <LazyCodeEditor {...props} />
    </Suspense>
  );
}
