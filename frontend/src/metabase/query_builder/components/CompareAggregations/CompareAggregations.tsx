import type { FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Stack, Text, Input } from "metabase/ui";
import type * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

import { ExpressionWidgetHeader } from "../expressions/ExpressionWidgetHeader";

import {
  ColumnPicker,
  OffsetInput,
  ReferenceAggregationPicker,
  ComparisonTypePicker,
  CurrentPerionInput,
  OffsetPresets,
  BucketInput,
} from "./components";
import type { ColumnType, ComparisonType } from "./types";
import {
  canSubmit,
  getBreakout,
  getTitle,
  updateQueryWithCompareOffsetAggregations,
} from "./utils";

interface Props {
  aggregations: Lib.AggregationClause[];
  query: Lib.Query;
  stageIndex: number;
  onClose: () => void;
  onSubmit: (query: Lib.Query, aggregations: Lib.ExpressionClause[]) => void;
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
  const matchedBreakout = useMemo(
    () => getBreakout(query, stageIndex),
    [query, stageIndex],
  );

  const [offset, setOffset] = useState<number | "">(DEFAULT_OFFSET);
  const [columns, setColumns] = useState<ColumnType[]>(DEFAULT_COLUMNS);
  const [comparisonType, setComparisonType] = useState<ComparisonType>(
    DEFAULT_COMPARISON_TYPE,
  );
  const [includeCurrentPeriod, setIncludeCurrentPeriod] = useState(false);
  const [bucket, setBucket] = useState<TemporalUnit | null>(
    matchedBreakout.bucket,
  );
  const [showPresets, setShowPresets] = useState(true);
  const width = aggregation ? STEP_2_WIDTH : STEP_1_WIDTH;

  const title = useMemo(
    () => getTitle(query, stageIndex, aggregation),
    [query, stageIndex, aggregation],
  );

  const handleHidePresets = useCallback(() => {
    setShowPresets(false);
  }, []);

  const handleOffsetChange = useCallback((offset: number | "") => {
    setOffset(offset);
    setShowPresets(false);
  }, []);

  const handleComparisonTypeChange = useCallback(
    (comparisonType: ComparisonType) => {
      setComparisonType(comparisonType);
      setColumns(convertColumnTypes(columns, comparisonType));

      if (comparisonType === "moving-average") {
        setOffset(2);
      }
      if (comparisonType === "offset") {
        setOffset(1);
      }
    },
    [columns],
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

    if (!aggregation) {
      return;
    }

    const next = updateQueryWithCompareOffsetAggregations(
      query,
      stageIndex,
      aggregation,
      offset,
      columns,
      matchedBreakout,
      bucket,
      includeCurrentPeriod,
    );

    if (!next) {
      return;
    }

    onSubmit(next.query, next.addedAggregations);
    onClose();
  };

  const shouldShowPresets =
    showPresets && comparisonType === "offset" && offset === 1;

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

              <Stack spacing="sm">
                <Input.Label>{t`Compare to`}</Input.Label>
                {shouldShowPresets && (
                  <OffsetPresets
                    query={query}
                    stageIndex={stageIndex}
                    bucket={bucket}
                    onBucketChange={setBucket}
                    onShowOffsetInput={handleHidePresets}
                    column={matchedBreakout.column}
                  />
                )}
                {!shouldShowPresets && (
                  <Flex align="flex-end" gap="md">
                    <OffsetInput
                      comparisonType={comparisonType}
                      value={offset}
                      onChange={handleOffsetChange}
                    />
                    <BucketInput
                      query={query}
                      stageIndex={stageIndex}
                      offset={offset || 0}
                      column={matchedBreakout.column}
                      value={bucket}
                      onChange={setBucket}
                    />
                    <Text align="center" c="text-light">{t`ago`}</Text>
                  </Flex>
                )}
              </Stack>

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
