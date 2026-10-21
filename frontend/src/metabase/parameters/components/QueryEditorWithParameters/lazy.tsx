import { Suspense } from "react";

import { lazyChunk } from "metabase/utils/lazy-chunk";

import type { QueryEditorWithParametersProps } from "./QueryEditorWithParameters";

// The chunk name matches the editor's own lazy import,
// so rspack emits the parameter plugs in the editor's chunk instead of one of their own.
const importQueryEditorWithParameters = () =>
  import(
    /* webpackChunkName: "query-editor" */
    "./QueryEditorWithParameters"
  );

export const loadQueryEditorWithParameters = () =>
  importQueryEditorWithParameters();

const LazyQueryEditorWithParameters = lazyChunk(() =>
  importQueryEditorWithParameters().then(({ QueryEditorWithParameters }) => ({
    default: QueryEditorWithParameters,
  })),
);

export function QueryEditorWithParameters(
  props: QueryEditorWithParametersProps,
) {
  return (
    <Suspense fallback={null}>
      <LazyQueryEditorWithParameters {...props} />
    </Suspense>
  );
}
