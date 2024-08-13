import type { FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Stack } from "metabase/ui";
import type * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../expressions/ExpressionWidgetHeader";

import {
  ColumnPicker,
  OffsetInput,
  ReferenceAggregationPicker,
  ComparisonTypePicker,
  CurrentPerionInput,
} from "./components";
import type { ColumnType, ComparisonType } from "./types";
import { canSubmit, getAggregations, getTitle } from "./utils";

interface Props {
  aggregations: Lib.AggregationClause[];
  query: Lib.Query;
  stageIndex: number;
  onClose: () => void;
  onSubmit: (aggregations: Lib.ExpressionClause[]) => void;
}

const DEFAULT_OFFSET = 1;
const DEFAULT_COMPARISON_TYPE = "offset";
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
  const [offset, setOffset] = useState<number | "">(DEFAULT_OFFSET);
  const [columns, setColumns] = useState<ColumnType[]>(DEFAULT_COLUMNS);
  const [comparisonType, setComparisonType] = useState<ComparisonType>(
    DEFAULT_COMPARISON_TYPE,
  );
  const [includeCurrentPeriod, setIncludeCurrentPeriod] = useState(false);
  const width = aggregation ? STEP_2_WIDTH : STEP_1_WIDTH;

  const title = useMemo(
    () => getTitle(query, stageIndex, aggregation),
    [query, stageIndex, aggregation],
  );

  const handleComparisonTypeChange = useCallback(
    (comparisonType: ComparisonType) => {
      setComparisonType(comparisonType);
      setColumns(convertColumnTypes(columns, comparisonType));
      if (comparisonType === "moving-average" && offset !== "" && offset <= 1) {
        setOffset(2);
      }
    },
    [offset, columns],
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
        includeCurrentPeriod,
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
              <ComparisonTypePicker
                value={comparisonType}
                onChange={handleComparisonTypeChange}
              />

              <OffsetInput
                query={query}
                stageIndex={stageIndex}
                comparisonType={comparisonType}
                value={offset}
                onChange={setOffset}
              />

              {comparisonType === "moving-average" && (
                <CurrentPerionInput
                  value={includeCurrentPeriod}
                  onChange={setIncludeCurrentPeriod}
                />
              )}

              <ColumnPicker
                value={columns}
                onChange={setColumns}
                comparisonType={comparisonType}
              />
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

const comparisonTypeMapping = {
  offset: {
    offset: "offset",
    "diff-offset": "diff-offset",
    "percent-diff-offset": "percent-diff-offset",
    "moving-average": "offset",
    "diff-moving-average": "diff-offset",
    "percent-diff-moving-average": "percent-diff-offset",
  },
  "moving-average": {
    offset: "moving-average",
    "diff-offset": "diff-moving-average",
    "percent-diff-offset": "percent-diff-moving-average",
    "moving-average": "moving-average",
    "diff-moving-average": "diff-moving-average",
    "percent-diff-moving-average": "percent-diff-moving-average",
  },
} as const;

function convertColumnTypes(
  columnTypes: ColumnType[],
  comparisonType: ComparisonType,
): ColumnType[] {
  return columnTypes.map(
    columnType => comparisonTypeMapping[comparisonType][columnType],
  );
}
