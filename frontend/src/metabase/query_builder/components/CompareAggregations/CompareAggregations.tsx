import { useCallback, useMemo, useState } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../expressions/ExpressionWidgetHeader";

import S from "./CompareAggregations.module.css";
import { getTitle } from "./utils";

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

export const CompareAggregations = ({ query, stageIndex, onClose }: Props) => {
  const aggregations = useMemo(() => {
    return Lib.aggregations(query, stageIndex);
  }, [query, stageIndex]);
  const hasManyAggregations = aggregations.length > 1;
  const [aggregation, setAggregation] = useState(
    hasManyAggregations ? undefined : aggregations[0],
  );

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

  return (
    <Box data-testid="compare-aggregations">
      <ExpressionWidgetHeader title={title} onBack={handleBack} />

      {!aggregation && (
        <AccordionList
          alwaysExpanded
          className={S.accordionList}
          maxHeight={Infinity}
          renderItemName={renderItemName}
          renderItemDescription={renderItemDescription}
          sections={sections}
          width="100%"
          onChange={handleAggregationChange}
        />
      )}
    </Box>
  );
};
