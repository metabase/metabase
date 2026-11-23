import { Suspense, lazy, useEffect, useState } from "react";

import type { InlineExpressionEditorProps } from "./types";

let isInlineEditorLoaded = false;

const importInlineEditor = () =>
  import(
    /* webpackChunkName: "expression-editor" */
    "../InlineExpressionEditorF"
  ).then((module) => {
    isInlineEditorLoaded = true;
    return module;
  });

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
  importInlineEditor().then(({ InlineExpressionEditorF }) => ({
    default: InlineExpressionEditorF,
  })),
);

export const InlineExpressionEditor = (props: InlineExpressionEditorProps) => (
  <Suspense fallback={null}>
    <LazyInlineExpressionEditor {...props} />
  </Suspense>
);
