import type { FormEvent } from "react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, NumberInput, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../expressions/ExpressionWidgetHeader";

import { ColumnPicker, ReferenceAggregationPicker } from "./components";
import { getPeriodTitle, getTitle } from "./utils";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  onClose: () => void;
  onSubmit: (aggregations: Lib.ExpressionClause[]) => void;
}

type ColumnType = "offset" | "diff-offset" | "percent-diff-offset";

const DEFAULT_OFFSET = 1;

const DEFAULT_COLUMNS: ColumnType[] = ["offset", "percent-diff-offset"];

const parsePeriodValue = (value: string): number | "" => {
  const number = parseInt(value, 10);
  return Number.isNaN(number) ? "" : Math.max(Math.abs(number), 1);
};

const canSubmit = (period: number | "", columns: ColumnType[]): boolean => {
  const isPeriodValid = typeof period === "number" && period > 0;
  const areColumnsValid = columns.length > 0;
  return isPeriodValid && areColumnsValid;
};

const getAggregations = (
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause | Lib.ExpressionClause,
  columns: ColumnType[],
  offset: number,
): Lib.ExpressionClause[] => {
  const aggregations: Lib.ExpressionClause[] = [];

  if (columns.includes("offset")) {
    aggregations.push(
      Lib.offsetClause(query, stageIndex, aggregation, -offset),
    );
  }

  if (columns.includes("diff-offset")) {
    aggregations.push(
      Lib.diffOffsetClause(query, stageIndex, aggregation, -offset),
    );
  }

  if (columns.includes("percent-diff-offset")) {
    aggregations.push(
      Lib.percentDiffOffsetClause(query, stageIndex, aggregation, -offset),
    );
  }

  return aggregations;
};

export const CompareAggregations = ({
  query,
  stageIndex,
  onClose,
  onSubmit,
}: Props) => {
  const aggregations = useMemo(() => {
    return Lib.aggregations(query, stageIndex);
  }, [query, stageIndex]);
  const hasManyAggregations = aggregations.length > 1;
  const [aggregation, setAggregation] = useState<
    Lib.AggregationClause | Lib.ExpressionClause | undefined
  >(hasManyAggregations ? undefined : aggregations[0]);
  const [offset, setOffset] = useState<number | "">(DEFAULT_OFFSET);
  const [columns, setColumns] = useState<ColumnType[]>(DEFAULT_COLUMNS);

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
    <Box data-testid="compare-aggregations">
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
              <NumberInput
                label={getPeriodTitle()}
                min={1}
                parseValue={parsePeriodValue}
                precision={0}
                size="md"
                step={1}
                type="number"
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
