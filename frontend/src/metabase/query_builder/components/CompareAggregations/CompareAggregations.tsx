import { useMemo, useState } from "react";

import AccordionList from "metabase/core/components/AccordionList";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";

import { ExpressionWidgetHeader } from "../expressions/ExpressionWidgetHeader";

import { getTitle } from "./utils";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  onClose: () => void;
}

type AggregationItem = {
  name: string;
  aggregation: Lib.AggregationClause;
};

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

  const sections = [
    {
      // key: "aggregations",
      // name: "",
      items: aggregations.map<AggregationItem>(aggregation => {
        const info = Lib.displayInfo(query, stageIndex, aggregation);

        return {
          name: info.displayName,
          aggregation,
        };
      }),
    },
  ];

  const handleAggregationChange = (item: AggregationItem) => {
    setAggregation(item.aggregation);
  };

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
          sections={sections}
          onChange={handleAggregationChange}
          // onChangeSection={handleSectionChange}
          // itemIsSelected={checkIsItemSelected}
          // renderItemName={renderItemName}
          // renderItemDescription={omitItemDescription}
          // disable scrollbars inside the list
          style={{ overflow: "visible" }}
          maxHeight={Infinity}
          withBorders
        />
      )}
    </Box>
  );
};
