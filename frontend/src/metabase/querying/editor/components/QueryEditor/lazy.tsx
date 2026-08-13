import { Suspense, lazy } from "react";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";

import type { QueryEditorProps } from "./QueryEditor";

// The query editor carries the native query editor and its CodeMirror
// extensions. Metric and transform routes link to it but never render it on
// first paint, so it loads on demand.
const importQueryEditor = () =>
  import(
    /* webpackChunkName: "query-editor" */
    "./QueryEditor"
  );

const LazyQueryEditor = lazy(() =>
  importQueryEditor().then(({ QueryEditor }) => ({ default: QueryEditor })),
);

export function QueryEditor(props: QueryEditorProps) {
  return (
    <Suspense fallback={<LoadingAndErrorWrapper loading />}>
      <LazyQueryEditor {...props} />
    </Suspense>
  );
}
