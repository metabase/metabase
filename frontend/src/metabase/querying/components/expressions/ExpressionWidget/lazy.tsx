import { Suspense, lazy } from "react";

import type { ExpressionWidgetProps } from "./ExpressionWidget";

// The widget carries the expression editor and its CodeMirror extensions, which
// no route needs on first paint.
const importExpressionWidget = () =>
  import(
    /* webpackChunkName: "expression-editor" */
    "./ExpressionWidget"
  );

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
