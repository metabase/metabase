// Single entry for the static-viz bundle the GraalVM renderer loads. Exposes the unified
// `MetabaseStaticViz.{renderChart,getCellBackgroundColors}` (string-in/string-out) API that
// metabase.channel.render.js.graal expects, bridging to this branch's split chart API
// (RenderChart/LegacyRenderChart) and the shared cell-color getter. Keeps chart rendering and
// table cell colors in one bundle (no separate color_selector bundle).
import "metabase/static-viz/mock-environment";

import { LegacyRenderChart, RenderChart } from "metabase/static-viz";
import { makeCellBackgroundGetter } from "metabase/visualizations/lib/table_format";

export function renderChart(inputJSON) {
  const input = JSON.parse(inputJSON);
  let content;
  switch (input.kind) {
    case "funnel":
      content = LegacyRenderChart("funnel", {
        data: input.data,
        settings: input.settings,
        tokenFeatures: input.tokenFeatures,
      });
      break;
    case "gauge":
      content = LegacyRenderChart("gauge", {
        card: input.card,
        data: input.data,
        tokenFeatures: input.tokenFeatures,
      });
      break;
    default:
      content = RenderChart(
        input.rawSeries,
        input.dashcardSettings,
        input.options,
      );
  }
  return JSON.stringify({
    type: content.startsWith("<svg") ? "svg" : "html",
    content,
  });
}

export function getCellBackgroundColors(inputJSON) {
  const { rows, cols, settings, cells } = JSON.parse(inputJSON);
  let getter;
  try {
    getter = makeCellBackgroundGetter(
      rows,
      cols,
      settings?.["table.column_formatting"] ?? [],
      Boolean(settings?.["table.pivot"]),
    );
  } catch (e) {
    console.error("Error building cell background getter", e);
    getter = () => null;
  }
  return JSON.stringify(
    cells.map(
      ([value, rowIndex, columnName]) =>
        getter(value, rowIndex, columnName) ?? null,
    ),
  );
}
