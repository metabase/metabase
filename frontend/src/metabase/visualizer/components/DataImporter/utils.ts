import { isCategory, isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Card } from "metabase-types/api";

type CardLike = Pick<
  Card,
  | "dataset_query"
  | "display"
  | "result_metadata"
  | "visualization_settings"
  | "type"
>;

export function getScoreFn(display?: string | null) {
  switch (display) {
    case "line":
    case "area":
    case "combo":
      return lineAreaCombo;
    case "bar":
    case "row":
    case "waterfall":
      return barRowWaterfallCombo;
    case "pie":
    case "funnel":
      return pieFunnel;
    case "table":
      return table;
    case "pivot":
      return pivotTable;
    case "scatter":
      return scatter;
    default:
      return () => 100;
  }
}

function lineAreaCombo(card: CardLike) {
  const isNative = card.dataset_query.type === "native";
  const isUnaggregated =
    "query" in card.dataset_query && !card.dataset_query.query.aggregation;

  const datetimeColumns = card.result_metadata.filter(column => isDate(column));
  const categoryColumns = card.result_metadata.filter(column =>
    isCategory(column),
  );
  const numericColumns = card.result_metadata.filter(column =>
    isNumeric(column),
  );

  if (card.type === "metric") {
    if (datetimeColumns.length > 0) {
      return 710;
    }
    if (categoryColumns.length > 0) {
      return 700;
    }
  }

  if (
    card.display === "area" ||
    card.display === "line" ||
    card.display === "combo"
  ) {
    return 600;
  }

  if (card.result_metadata.length === 2 && numericColumns.length > 0) {
    return 500;
  }

  if (
    (isNative || isUnaggregated) &&
    numericColumns.length > 1 &&
    datetimeColumns.length > 1
  ) {
    return 400;
  }

  return card.type === "model" ? 300 : 200;
}

function barRowWaterfallCombo(card: CardLike) {
  const datetimeColumns = card.result_metadata.filter(column => isDate(column));
  const categoryColumns = card.result_metadata.filter(column =>
    isCategory(column),
  );
  const numericColumns = card.result_metadata.filter(column =>
    isNumeric(column),
  );

  if (card.type === "metric") {
    if (categoryColumns.length > 0) {
      return 700;
    }
    if (datetimeColumns.length > 0) {
      return 600;
    }
  }

  if (
    card.display === "bar" ||
    card.display === "row" ||
    card.display === "waterfall" ||
    card.display === "combo"
  ) {
    return 500;
  }

  if (card.result_metadata.length === 2 && numericColumns.length > 0) {
    return 400;
  }

  if (card.result_metadata.length === 3 && numericColumns.length > 0) {
    return 300;
  }

  return card.type === "model" ? 300 : 200;
}

function pieFunnel(card: CardLike) {
  const datetimeColumns = card.result_metadata.filter(column => isDate(column));
  const categoryColumns = card.result_metadata.filter(column =>
    isCategory(column),
  );
  const numericColumns = card.result_metadata.filter(column =>
    isNumeric(column),
  );

  if (card.type === "metric") {
    if (categoryColumns.length > 0) {
      return 700;
    }
    if (datetimeColumns.length > 0) {
      return 600;
    }
  }

  if (card.display === "pie" || card.display === "funnel") {
    return 500;
  }

  if (card.result_metadata.length === 2 && numericColumns.length > 0) {
    return 400;
  }

  return card.type === "model" ? 300 : 200;
}

function table(card: CardLike) {
  if (card.type === "model") {
    return 700;
  }
  if (card.display === "table") {
    return 600;
  }
  return card.type === "metric" ? 500 : 400;
}

function pivotTable(card: CardLike) {
  if (card.type === "metric") {
    return 700;
  }
  if (card.display === "pivot") {
    return 600;
  }
  return card.type === "model" ? 500 : 400;
}

function scatter(card: CardLike) {
  if (card.type === "model") {
    return 700;
  }
  if (card.type === "metric") {
    return 600;
  }
  return card.display === "scatter" ? 500 : 400;
}
