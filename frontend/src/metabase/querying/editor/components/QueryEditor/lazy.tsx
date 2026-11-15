import { Suspense, lazy } from "react";

import type { QueryEditorProps } from "./QueryEditor";

// The query editor carries the native query editor and its CodeMirror
// extensions. Metric and transform routes link to it but never render it on
// first paint, so it loads on demand.
const importQueryEditor = () =>
  import(
    /* webpackChunkName: "query-editor" */
    "./QueryEditor"
  );

/**
 * The editor's chunk. A page that already waits on its own data folds this into
 * that wait, so the editor arrives with the page instead of after it.
 */
export const loadQueryEditor = () => importQueryEditor();

const LazyQueryEditor = lazy(() =>
  importQueryEditor().then(({ QueryEditor }) => ({ default: QueryEditor })),
);

export function QueryEditor(props: QueryEditorProps) {
  return (
    <Suspense fallback={null}>
      <LazyQueryEditor {...props} />
    </Suspense>
  );
}
