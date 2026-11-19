import { Suspense, lazy, useEffect, useState } from "react";

import {
  EXPRESSION_EDITOR_VERSION_SETTING,
  usePrototypeSetting,
} from "metabase/prototype";

import type { InlineExpressionEditorProps } from "./InlineExpressionEditor";

let isInlineEditorLoaded = false;

// Prototype: the versions of the editor load together, so that switching
// between them doesn't wait for a chunk.
const importInlineEditor = () =>
  Promise.all([
    import(
      /* webpackChunkName: "expression-editor" */
      "./InlineExpressionEditor"
    ),
    import(
      /* webpackChunkName: "expression-editor" */
      "../InlineExpressionEditorB"
    ),
    import(
      /* webpackChunkName: "expression-editor" */
      "../InlineExpressionEditorC"
    ),
  ]).then(([module, moduleB, moduleC]) => {
    isInlineEditorLoaded = true;
    return { ...module, ...moduleB, ...moduleC };
  });

export const prefetchInlineExpressionEditor = () => {
  void importInlineEditor();
};

export const useInlineExpressionEditorChunk = () => {
  const [isLoaded, setIsLoaded] = useState(isInlineEditorLoaded);

  useEffect(() => {
    if (isLoaded) {
      return;
    }

    let isCancelled = false;
    importInlineEditor().then(() => {
      if (!isCancelled) {
        setIsLoaded(true);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [isLoaded]);

  return isLoaded;
};

const LazyInlineExpressionEditor = lazy(() =>
  importInlineEditor().then(({ InlineExpressionEditor }) => ({
    default: InlineExpressionEditor,
  })),
);

const LazyInlineExpressionEditorB = lazy(() =>
  importInlineEditor().then(({ InlineExpressionEditorB }) => ({
    default: InlineExpressionEditorB,
  })),
);

const LazyInlineExpressionEditorC = lazy(() =>
  importInlineEditor().then(({ InlineExpressionEditorC }) => ({
    default: InlineExpressionEditorC,
  })),
);

export const InlineExpressionEditor = (props: InlineExpressionEditorProps) => {
  const [version] = usePrototypeSetting(EXPRESSION_EDITOR_VERSION_SETTING);
  return (
    <Suspense fallback={null}>
      {version === "b" && <LazyInlineExpressionEditorB {...props} />}
      {version === "c" && <LazyInlineExpressionEditorC {...props} />}
      {version !== "b" && version !== "c" && (
        <LazyInlineExpressionEditor {...props} />
      )}
    </Suspense>
  );
};
