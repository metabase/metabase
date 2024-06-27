import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { NumericValue } from "metabase-types/api/number";

import { ExpressionWidgetHeader } from "../expressions/ExpressionWidgetHeader";

import {
  ColumnPicker,
  OffsetInput,
  ReferenceAggregationPicker,
} from "./components";
import type { ColumnType } from "./types";
import { canSubmit, getAggregations, getTitle } from "./utils";

interface Props {
  aggregations: Lib.AggregationClause[];
  query: Lib.Query;
  stageIndex: number;
  onClose: () => void;
  onSubmit: (aggregations: Lib.ExpressionClause[]) => void;
}

const DEFAULT_OFFSET = 1;
const DEFAULT_COLUMNS: ColumnType[] = ["offset", "percent-diff-offset"];
const STEP_1_WIDTH = 378;
const STEP_2_WIDTH = 472;

export const CompareAggregations = ({
  aggregations,
  query,
  stageIndex,
  onClose,
  onSubmit,
}: Props) => {
  const hasManyAggregations = aggregations.length > 1;
  const [aggregation, setAggregation] = useState<
    Lib.AggregationClause | Lib.ExpressionClause | undefined
  >(hasManyAggregations ? undefined : aggregations[0]);
  const [offset, setOffset] = useState<NumericValue | "">(DEFAULT_OFFSET);
  const [columns, setColumns] = useState<ColumnType[]>(DEFAULT_COLUMNS);
  const width = aggregation ? STEP_2_WIDTH : STEP_1_WIDTH;

  const title = useMemo(
    () => getTitle(query, stageIndex, aggregation),
    [query, stageIndex, aggregation],
  );

  const handleBack = () => {
    if (hasManyAggregations && aggregation) {
      setAggregation(undefined);
    } else {
      onClose();
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();

    if (aggregation && offset !== "") {
      const aggregations = getAggregations(
        query,
        stageIndex,
        aggregation,
        columns,
        offset,
      );
      onSubmit(aggregations);
      onClose();
    }
  };

  return (
    <Box miw={width} maw={width}>
      <ExpressionWidgetHeader title={title} onBack={handleBack} />

      {!aggregation && (
        <ReferenceAggregationPicker
          query={query}
          stageIndex={stageIndex}
          onChange={setAggregation}
        />
      )}

      {aggregation && (
        <form onSubmit={handleSubmit}>
          <Stack p="lg" spacing="xl">
            <Stack spacing="md">
              <OffsetInput
                query={query}
                stageIndex={stageIndex}
                value={offset}
                onChange={setOffset}
              />

              <ColumnPicker value={columns} onChange={setColumns} />
            </Stack>

            <Flex justify="flex-end">
              <Button
                disabled={!canSubmit(offset, columns)}
                type="submit"
                variant="filled"
              >{t`Done`}</Button>
            </Flex>
          </Stack>
        </form>
      )}
    </Box>
  );
};
