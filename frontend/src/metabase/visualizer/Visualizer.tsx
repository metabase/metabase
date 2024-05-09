import { useEffect, useMemo, useState } from "react";
import { useMap, usePrevious } from "react-use";
import _ from "underscore";

import { skipToken, useCardQueryQuery } from "metabase/api";
import { QuestionPicker } from "metabase/dashboard/components/QuestionPicker";
import { Card, Center, Grid, Loader } from "metabase/ui";
import {
  isCategory,
  isNumber,
  isPK,
  isFK,
  isString,
} from "metabase-lib/v1/types/utils/isa";
import type { CardId, Dataset, RowValues } from "metabase-types/api";

export function Visualizer() {
  const [cardDataMap, cardDataMapActions] = useMap<Record<CardId, Dataset>>({});
  const [fetchedCardId, setFetchedCardId] = useState<CardId | null>(null);

  const cardQuery = useCardQueryQuery(fetchedCardId ?? skipToken);
  const wasFetching = usePrevious(cardQuery.isFetching);

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
          ) : (
            <div>
              {combinedRows.map(
                (row, index) =>
                  row && (
                    <div key={index} style={{ marginTop: "0.5rem" }}>
                      {row.map((value, index) => (
                        <span key={index} style={{ padding: "0.25rem" }}>
                          {value}
                        </span>
                      ))}
                    </div>
                  ),
              )}
            </div>
          )}
        </Card>
      </Grid.Col>
    </Grid>
  );
}
