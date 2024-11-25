import { useMemo } from "react";
import _ from "underscore";

import { useListCardsQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import { Box } from "metabase/ui";
import { getVisualizationType } from "metabase/visualizer/selectors";
import { createDataSource } from "metabase/visualizer/utils";
import { isCategory, isDate, isNumeric } from "metabase-lib/v1/types/utils/isa";
import type { Card } from "metabase-types/api";
import type {
  VisualizerDataSource,
  VisualizerDataSourceId,
} from "metabase-types/store/visualizer";

interface QuestionListProps {
  dataSourceIds: Set<VisualizerDataSourceId>;
  onSelect: (item: VisualizerDataSource) => void;
}

export function QuestionList({ dataSourceIds, onSelect }: QuestionListProps) {
  const { data: cards = [], isLoading } = useListCardsQuery({ f: "all" });
  const display = useSelector(getVisualizationType);

  const items = useMemo(() => {
    const calcScore = getScoreFn(display);
    const cardsWithScores = cards.map(card => ({
      card,
      score: calcScore(card),
    }));
    return _.sortBy(cardsWithScores, "score")
      .reverse()
      .map(({ card }) => createDataSource("card", card.id, card.name));
  }, [cards, display]);

  if (isLoading) {
    return null;
  }

  return (
    <Box component="ul">
      {items.map(item => (
        <Box
          key={item.id}
          component="li"
          px={14}
          py={10}
          mb={4}
          style={{
            border: "1px solid var(--mb-color-border)",
            borderRadius: 5,
            cursor: "pointer",
            backgroundColor: dataSourceIds.has(item.id)
              ? "var(--mb-color-bg-light)"
              : "transparent",
          }}
          onClick={() => onSelect(item)}
        >
          {item.name}
        </Box>
      ))}
    </Box>
  );
}

function getScoreFn(display?: string | null) {
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

function lineAreaCombo(card: Card) {
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

function barRowWaterfallCombo(card: Card) {
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

function pieFunnel(card: Card) {
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

function table(card: Card) {
  if (card.type === "model") {
    return 700;
  }
  if (card.display === "table") {
    return 600;
  }
  return card.type === "metric" ? 500 : 400;
}

function pivotTable(card: Card) {
  if (card.type === "metric") {
    return 700;
  }
  if (card.display === "pivot") {
    return 600;
  }
  return card.type === "model" ? 500 : 400;
}

function scatter(card: Card) {
  if (card.type === "model") {
    return 700;
  }
  if (card.type === "metric") {
    return 600;
  }
  return card.display === "scatter" ? 500 : 400;
}
