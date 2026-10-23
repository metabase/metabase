import { Suspense, lazy, useEffect, useState } from "react";

import type { ExpressionWidgetProps } from "./ExpressionWidget";

let isExpressionWidgetLoaded = false;

// The widget carries the expression editor and its CodeMirror extensions, which
// no route needs on first paint.
const importExpressionWidget = () =>
  import(
    /* webpackChunkName: "expression-editor" */
    "./ExpressionWidget"
  ).then((module) => {
    isExpressionWidgetLoaded = true;
    return module;
  });

/**
 * Start the download before the user asks for the widget, so opening it does not
 * wait on the network. Callers pair this with a `startTransition` around the
 * state change that opens it: the picker they are looking at stays on screen
 * until the whole widget is ready, so it appears complete rather than as a shell
 * that fills in.
 */
export const prefetchExpressionWidget = () => {
  void importExpressionWidget();
};

/**
 * Report whether the widget is ready to render. Callers that open a popover
 * straight onto the widget use this to keep the popover shut until then, so it
 * never appears as an empty box that the editor drops into later.
 */
export const useExpressionWidgetChunk = () => {
  const [isLoaded, setIsLoaded] = useState(isExpressionWidgetLoaded);

  useEffect(() => {
    if (isLoaded) {
      return;
    }

    let isCancelled = false;
    importExpressionWidget().then(() => {
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

const LazyExpressionWidget = lazy(() =>
  importExpressionWidget().then(({ ExpressionWidget }) => ({
    default: ExpressionWidget,
  })),
);

export const ExpressionWidget = (props: ExpressionWidgetProps) => (
  <Suspense fallback={null}>
    <LazyExpressionWidget {...props} />
  </Suspense>
);
