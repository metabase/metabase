import cx from "classnames";
import { Suspense, lazy } from "react";

import type { CodeEditorProps } from "./CodeEditor";
import S from "./CodeEditorFallback.module.css";

// CodeMirror and its language modes are among the largest dependencies in the
// app bundle. Loading the editor lazily keeps all of them out of the initial
// page load, since no route renders a code editor on first paint.
const LazyCodeEditor = lazy(() =>
  import(
    /* webpackChunkName: "code-editor" */
    "./CodeEditor"
  ).then(({ CodeEditor }) => ({ default: CodeEditor })),
);

export function CodeEditor(props: CodeEditorProps) {
  return (
    <Suspense
      fallback={
        <pre className={cx(S.fallback, props.className)}>
          {props.proposedValue ?? props.value}
        </pre>
      }
    >
      <LazyCodeEditor {...props} />
    </Suspense>
  );
}
