import AccordionList from "metabase/core/components/AccordionList";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import S from "./OffsetAggregationList.module.css";

type OffsetAggregationListProps = {
  query: Lib.Query;
  stageIndex: number;
  aggregations: Lib.AggregationClause[];
  onChange: (aggregation: Lib.AggregationClause) => void;
};

type AggregationItem = {
  name: string;
  aggregation: Lib.AggregationClause;
};

export function OffsetAggregationList({
  query,
  stageIndex,
  aggregations,
  onChange,
}: OffsetAggregationListProps) {
  const sections = getSections(query, stageIndex, aggregations);

  const handleChange = (item: AggregationItem) => {
    onChange(item.aggregation);
  };

  return (
    <Box w="23.5rem" py="sm">
      <AccordionList
        className={S.list}
        sections={sections}
        width="100%"
        maxHeight={Infinity}
        alwaysExpanded
        onChange={handleChange}
      />
    </Box>
  );
}

function getSections(
  query: Lib.Query,
  stageIndex: number,
  aggregations: Lib.AggregationClause[],
) {
  const items = aggregations.map<AggregationItem>(aggregation => {
    const aggregationInfo = Lib.displayInfo(query, stageIndex, aggregation);
    return { name: aggregationInfo.displayName, aggregation };
  });
  return [{ items }];
}
