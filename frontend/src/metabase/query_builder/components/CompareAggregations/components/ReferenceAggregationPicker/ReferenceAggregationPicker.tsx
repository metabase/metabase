import { useCallback, useMemo } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import * as Lib from "metabase-lib";

import S from "./ReferenceAggregationPicker.module.css";

type AggregationItem = Lib.AggregationClauseDisplayInfo & {
  aggregation: Lib.AggregationClause;
};

const renderItemName = (item: AggregationItem) => item.displayName;

const renderItemDescription = () => null;

const getAggregationSections = (query: Lib.Query, stageIndex: number) => {
  const aggregations = Lib.aggregations(query, stageIndex);
  const items = aggregations.map<AggregationItem>(aggregation => {
    const info = Lib.displayInfo(query, stageIndex, aggregation);
    return { ...info, aggregation };
  });
  const sections = [{ items }];
  return sections;
};

interface Props {
  query: Lib.Query;
  stageIndex: number;
  onChange: (aggregation: Lib.AggregationClause | Lib.ExpressionClause) => void;
}

export const ReferenceAggregationPicker = ({
  query,
  stageIndex,
  onChange,
}: Props) => {
  const sections = useMemo(() => {
    return getAggregationSections(query, stageIndex);
  }, [query, stageIndex]);

  const handleChange = useCallback(
    (item: AggregationItem) => {
      onChange(item.aggregation);
    },
    [onChange],
  );

  return (
    <AccordionList
      alwaysExpanded
      className={S.accordionList}
      maxHeight={Infinity}
      renderItemDescription={renderItemDescription}
      renderItemName={renderItemName}
      sections={sections}
      width="100%"
      onChange={handleChange}
    />
  );
};
