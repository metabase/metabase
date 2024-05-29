import type { FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import {
  Box,
  Button,
  Flex,
  MultiAutocomplete,
  NumberInput,
  Stack,
} from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../expressions/ExpressionWidgetHeader";

import S from "./CompareAggregations.module.css";
import { getPeriodTitle, getTitle } from "./utils";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  onClose: () => void;
  onSubmit: (aggregations: Lib.ExpressionClause[]) => void;
}

type AggregationItem = Lib.AggregationClauseDisplayInfo & {
  aggregation: Lib.AggregationClause;
};

type ColumnType = "offset" | "diff-offset" | "percent-diff-offset";

const DEFAULT_OFFSET = 1;

const DEFAULT_COLUMNS: ColumnType[] = ["offset", "percent-diff-offset"];

const renderItemName = (item: AggregationItem) => item.displayName;

const renderItemDescription = () => null;

const parsePeriodValue = (value: string): number | "" => {
  const number = parseInt(value, 10);
  return Number.isNaN(number) ? "" : Math.max(Math.abs(number), 1);
};

const canSubmit = (period: number | "", columns: ColumnType[]): boolean => {
  const isPeriodValid = typeof period === "number" && period > 0;
  const areColumnsValid = columns.length > 0;
  return isPeriodValid && areColumnsValid;
};

const getAggregationSections = (
  query: Lib.Query,
  stageIndex: number,
  aggregations: Lib.AggregationClause[],
) => {
  const items = aggregations.map<AggregationItem>(aggregation => {
    const info = Lib.displayInfo(query, stageIndex, aggregation);
    return { ...info, aggregation };
  });
  const sections = [{ items }];
  return sections;
};

const getAggregations = (
  query: Lib.Query,
  stageIndex: number,
  aggregation: Lib.AggregationClause,
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

const COLUMN_OPTIONS: { label: string; value: ColumnType }[] = [
  { label: t`Previous value`, value: "offset" },
  { label: t`Percentage difference`, value: "percent-diff-offset" },
  { label: t`Value difference`, value: "diff-offset" },
];

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
  const [aggregation, setAggregation] = useState(
    hasManyAggregations ? undefined : aggregations[0],
  );
  const [offset, setOffset] = useState<number | "">(DEFAULT_OFFSET);
  const [columns, setColumns] = useState<ColumnType[]>(DEFAULT_COLUMNS);

  const title = useMemo(
    () => getTitle(query, stageIndex, aggregation),
    [query, stageIndex, aggregation],
  );

  const sections = useMemo(() => {
    return getAggregationSections(query, stageIndex, aggregations);
  }, [query, stageIndex, aggregations]);

  const handleAggregationChange = useCallback((item: AggregationItem) => {
    setAggregation(item.aggregation);
  }, []);

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
    }
  };

  return (
    <Box data-testid="compare-aggregations">
      <ExpressionWidgetHeader title={title} onBack={handleBack} />

      {!aggregation && (
        <AccordionList
          alwaysExpanded
          className={S.accordionList}
          maxHeight={Infinity}
          renderItemDescription={renderItemDescription}
          renderItemName={renderItemName}
          sections={sections}
          width="100%"
          onChange={handleAggregationChange}
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

              <MultiAutocomplete
                label={t`Columns to create`}
                data={COLUMN_OPTIONS}
                placeholder={t`Columns to create`}
                rightSection={null}
                shouldCreate={() => false} // TODO
                value={columns}
                onChange={values => setColumns(values as ColumnType[])}
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
