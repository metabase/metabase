import { useEffect, useMemo, useState } from "react";
import { useMap, usePrevious } from "react-use";
import _ from "underscore";

import { skipToken, useCardQueryQuery } from "metabase/api";
import { QuestionPicker } from "metabase/dashboard/components/QuestionPicker";
import { useSelector } from "metabase/lib/redux";
import { getMetadata } from "metabase/selectors/metadata";
import { Card, Center, Grid, Loader } from "metabase/ui";
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
  const [fetchedCardId, setFetchedCardId] = useState<CardId | null>(null);

  const cardQuery = useCardQueryQuery(fetchedCardId ?? skipToken);
  const wasFetching = usePrevious(cardQuery.isFetching);

  const metadata = useSelector(getMetadata);

  useEffect(() => {
    if (
      fetchedCardId &&
      !cardDataMap[fetchedCardId] &&
      cardQuery.data &&
      !cardQuery.isFetching &&
      wasFetching
    ) {
      cardDataMapActions.set(fetchedCardId, cardQuery.data);
      setFetchedCardId(null);
    }
  }, [fetchedCardId, cardDataMap, cardDataMapActions, cardQuery, wasFetching]);

  const combinedRows = useMemo(() => {
    const rows: RowValues[] = [];

    Object.values(cardDataMap).forEach(dataset => {
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
  }, [cardDataMap]);

  const combinedSeries = useMemo(() => {
    const card = {
      display: "bar",
      visualization_settings: {},
    };

    const data = {
      rows: combinedRows,
      cols: [FAKE_METRIC_COLUMN, FAKE_CATEGORY_COLUMN],
    };

    return [{ card, data }];
  }, [combinedRows]);

  const hasMinData = combinedRows.length > 0;

  const isLoading =
    cardQuery.isFetching || (fetchedCardId && !cardDataMap[fetchedCardId]);

  const handleQuestionSelected = (questionId: CardId) => {
    if (isLoading) {
      return;
    }
    if (cardDataMap[questionId]) {
      setFetchedCardId(null);
      cardDataMapActions.remove(questionId);
    } else {
      setFetchedCardId(questionId);
    }
  };

  return (
    <Grid p="md" w="100%" h="100%">
      <Grid.Col span={3}>
        <QuestionPicker onSelect={handleQuestionSelected} onClose={_.noop} />
      </Grid.Col>
      <Grid.Col span={9}>
        <Card withBorder w="100%" h="100%">
          {isLoading ? (
            <Center w="100%" h="100%">
              <Loader size="xl" />
            </Center>
          ) : hasMinData ? (
            <BaseVisualization rawSeries={combinedSeries} metadata={metadata} />
          ) : null}
        </Card>
      </Grid.Col>
    </Grid>
  );
}
