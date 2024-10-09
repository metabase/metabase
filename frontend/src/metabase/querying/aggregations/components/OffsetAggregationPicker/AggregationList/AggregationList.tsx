import AccordionList from "metabase/core/components/AccordionList";
import * as Lib from "metabase-lib";

type AggregationListProps = {
  query: Lib.Query;
  stageIndex: number;
  onChange: (aggregation: Lib.AggregationClause) => void;
};

type AggregationItem = {
  name: string;
  aggregation: Lib.AggregationClause;
};

export function AggregationList({
  query,
  stageIndex,
  onChange,
}: AggregationListProps) {
  const sections = getSections(query, stageIndex);

  const handleChange = (item: AggregationItem) => {
    onChange(item.aggregation);
  };

  return (
    <AccordionList
      sections={sections}
      width="100%"
      maxHeight={Infinity}
      alwaysExpanded
      onChange={handleChange}
    />
  );
}

function getSections(query: Lib.Query, stageIndex: number) {
  const aggregations = Lib.aggregations(query, stageIndex);
  const items = aggregations.map<AggregationItem>(aggregation => {
    const aggregationInfo = Lib.displayInfo(query, stageIndex, aggregation);
    return { name: aggregationInfo.displayName, aggregation };
  });
  return [{ items }];
}
