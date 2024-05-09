import { useEffect, useMemo, useState } from "react";
import { useMap, usePrevious, useSet } from "react-use";
import _ from "underscore";

import { skipToken, useCardQueryQuery } from "metabase/api";
import { QuestionPicker } from "metabase/dashboard/components/QuestionPicker";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import {
  Button,
  Card,
  Center,
  Flex,
  Grid,
  Loader,
  Select,
  Stack,
} from "metabase/ui";
import visualizations from "metabase/visualizations";
import BaseVisualization from "metabase/visualizations/components/Visualization";
import {
  isCategory,
  isNumber,
  isPK,
  isFK,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type {
  CardId,
  Dataset,
  DatasetColumn,
  RowValues,
} from "metabase-types/api";

const FAKE_METRIC_COLUMN: DatasetColumn = {
  base_type: "type/Integer",
  effective_type: "type/Integer",
  field_ref: ["field", "COUNT", { "base-type": "type/Integer" }],
  name: "COUNT",
  display_name: "COUNT (FAKE)",

  source: "fake",
};

const FAKE_CATEGORY_COLUMN: DatasetColumn = {
  base_type: "type/Text",
  effective_type: "type/Text",
  field_ref: ["field", "EVENT", { "base-type": "type/Text" }],
  name: "EVENT",
  display_name: "EVENT (FAKE)",

  source: "fake",
};

export function Visualizer() {
  const [cardDataMap, cardDataMapActions] = useMap<Record<CardId, Dataset>>({});
  const [selectedCardIds, selectedCardsActions] = useSet(new Set<CardId>());
  const [vizType, setVizType] = useState("bar");

  const cardIdToFetch = Array.from(selectedCardIds).find(
    cardId => !cardDataMap[cardId],
  );

  const cardQuery = useCardQueryQuery(cardIdToFetch ?? skipToken);
  const wasFetching = usePrevious(cardQuery.isFetching);

  const metadata = useSelector(getMetadata);

  useEffect(() => {
    if (
      cardIdToFetch &&
      !cardDataMap[cardIdToFetch] &&
      cardQuery.data &&
      !cardQuery.isFetching &&
      wasFetching
    ) {
      cardDataMapActions.set(cardIdToFetch, cardQuery.data);
    }
  }, [cardIdToFetch, cardDataMap, cardDataMapActions, cardQuery, wasFetching]);

  const combinedRows = useMemo(() => {
    const rows: RowValues[] = [];

    Array.from(selectedCardIds).forEach(cardId => {
      const dataset = cardDataMap[cardId];

      if (!dataset) {
        return;
      }

      const metricColumnIndex = dataset.data.cols.findIndex(
        col => isNumber(col) && !isPK(col) && !isFK(col),
      );

      let categoryColumnIndex = dataset.data.cols.findIndex(col =>
        isCategory(col),
      );
      if (categoryColumnIndex === -1) {
        categoryColumnIndex = dataset.data.cols.findIndex(col => isString(col));
      }

      const lastRow = _.last(dataset.data.rows);

      if (lastRow && metricColumnIndex !== -1 && categoryColumnIndex !== -1) {
        const metricValue = lastRow[metricColumnIndex];
        const categoryValue = lastRow[categoryColumnIndex];
        rows.push([metricValue, categoryValue]);
      }
    });

    return rows;
  }, [cardDataMap, selectedCardIds]);

  const combinedSeries = useMemo(() => {
    const card = {
      display: vizType,
      visualization_settings: {},
    };

    const data = {
      rows: combinedRows,
      cols: [FAKE_METRIC_COLUMN, FAKE_CATEGORY_COLUMN],
    };

    return [{ card, data }];
  }, [vizType, combinedRows]);

  const hasMinData = combinedRows.length > 0;

  const isLoading =
    cardQuery.isFetching || (cardIdToFetch && !cardDataMap[cardIdToFetch]);

  const handleQuestionSelected = (questionId: CardId) => {
    if (isLoading) {
      return;
    }
    if (selectedCardIds.has(questionId)) {
      selectedCardsActions.remove(questionId);
    } else {
      selectedCardsActions.add(questionId);
    }
  };

  const vizOptions = Array.from(visualizations)
    .filter(([, viz]) => !viz.hidden)
    .map(([vizType, viz]) => ({
      label: viz.uiName,
      value: vizType,
      icon: viz.iconName,
      disabled:
        hasMinData && viz.isSensible && !viz.isSensible(combinedSeries[0].data),
    }));

  return (
    <Grid p="md" w="100%" h="100%">
      <Grid.Col span={3}>
        <QuestionPicker onSelect={handleQuestionSelected} onClose={_.noop} />
      </Grid.Col>
      <Grid.Col span={9}>
        <Card withBorder w="100%" h="100%">
          <Center w="100%" h="100%">
            {isLoading ? (
              <Loader size="xl" />
            ) : hasMinData ? (
              <Stack w="100%" h="100%">
                <Flex gap="sm">
                  <Button
                    onClick={() => selectedCardsActions.reset()}
                    disabled={selectedCardIds.size === 0}
                  >
                    Remove all
                  </Button>
                  <Select
                    value={vizType}
                    data={vizOptions}
                    onChange={e => e && setVizType(e)}
                    style={{ maxWidth: "240px" }}
                    styles={{
                      dropdown: {
                        maxHeight: "320px !important",
                      },
                    }}
                  />
                </Flex>
                <BaseVisualization
                  rawSeries={combinedSeries}
                  isDashboard={combinedSeries[0].card.display === "table"}
                  metadata={metadata}
                />
              </Stack>
            ) : null}
          </Center>
        </Card>
      </Grid.Col>
    </Grid>
  );
}
