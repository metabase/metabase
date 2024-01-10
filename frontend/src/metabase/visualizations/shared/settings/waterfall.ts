import type { RenderingContext } from "metabase/visualizations/types";

export function getDefaultIncreaseColor(renderingContext: RenderingContext) {
  return renderingContext.getColor("accent1");
}

export function getDefaultDecreaseColor(renderingContext: RenderingContext) {
  return renderingContext.getColor("accent3");
}

export function getDefaultTotalColor(renderingContext: RenderingContext) {
  return renderingContext.getColor("text-dark");
}

export function getDefaultShowTotal() {
  return true;
}
