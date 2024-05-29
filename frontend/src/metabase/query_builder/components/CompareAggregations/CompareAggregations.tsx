import type { FormEvent } from "react";
import { useCallback, useMemo, useState } from "react";
import { t } from "ttag";

import AccordionList from "metabase/core/components/AccordionList";
import { Box, Button, Flex, NumberInput, Stack } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../expressions/ExpressionWidgetHeader";

import S from "./CompareAggregations.module.css";
import { getPeriodTitle, getTitle } from "./utils";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  onClose: () => void;
}

type AggregationItem = Lib.AggregationClauseDisplayInfo & {
  aggregation: Lib.AggregationClause;
};

const renderItemName = (item: AggregationItem) => item.displayName;

const renderItemDescription = () => null;

const parsePeriodValue = (value: string): number | "" => {
  const number = parseInt(value, 10);
  return Number.isNaN(number) ? "" : Math.max(Math.abs(number), 1);
};

export const CompareAggregations = ({ query, stageIndex, onClose }: Props) => {
  const aggregations = useMemo(() => {
    return Lib.aggregations(query, stageIndex);
  }, [query, stageIndex]);
  const hasManyAggregations = aggregations.length > 1;
  const [aggregation, setAggregation] = useState(
    hasManyAggregations ? undefined : aggregations[0],
  );
  const [period, setPeriod] = useState<number | "">(1);
  const isValid = typeof period === "number" && period > 0; // TODO include columns to create

  const title = useMemo(
    () => getTitle(query, stageIndex, aggregation),
    [query, stageIndex, aggregation],
  );

  const items = useMemo(() => {
    return aggregations.map<AggregationItem>(aggregation => {
      const info = Lib.displayInfo(query, stageIndex, aggregation);
      return { ...info, aggregation };
    });
  }, [query, stageIndex, aggregations]);

  const sections = useMemo(() => [{ items }], [items]);

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
    // TODO: implement me
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
            <NumberInput
              label={getPeriodTitle()}
              min={1}
              parseValue={parsePeriodValue}
              precision={0}
              size="md"
              step={1}
              type="number"
              value={period}
              onChange={setPeriod}
            />

            <Flex justify="flex-end">
              <Button
                disabled={!isValid}
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
