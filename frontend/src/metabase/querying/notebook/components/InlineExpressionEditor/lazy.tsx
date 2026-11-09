import { Suspense, lazy, useEffect, useState } from "react";

import type { InlineExpressionEditorProps } from "./InlineExpressionEditor";

let isInlineEditorLoaded = false;

const importInlineEditor = () =>
  import(
    /* webpackChunkName: "expression-editor" */
    "./InlineExpressionEditor"
  ).then((module) => {
    isInlineEditorLoaded = true;
    return module;
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

export const InlineExpressionEditor = (props: InlineExpressionEditorProps) => (
  <Suspense fallback={null}>
    <LazyInlineExpressionEditor {...props} />
  </Suspense>
);
