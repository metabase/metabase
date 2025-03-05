import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import type { NumberOrEmptyValue } from "metabase/querying/filters/hooks/use-number-filter";
import { Box } from "metabase/ui";
import * as Lib from "metabase-lib";
import type { DatasetColumn } from "metabase-types/api";

interface Props {
  query: Lib.Query;
  stageIndex: number;
  column: Lib.ColumnMetadata;
  values: NumberOrEmptyValue[];
  clicked: Lib.ClickObject;
  onChange: (values: NumberOrEmptyValue[]) => void;
}

export const RangePicker = ({
  query,
  stageIndex,
  column,
  clicked,
  values,
  onChange,
}: Props) => {
  const distributionQuery = useMemo(
    () => getDistributionQuery(query, stageIndex, clicked.column),
    [query, stageIndex, clicked.column],
  );
  const legacyQuery = useMemo(
    () => Lib.toLegacyQuery(distributionQuery),
    [distributionQuery],
  );

  const { data, isLoading } = useGetAdhocQueryQuery(legacyQuery);

  if (isLoading) {
    return (
      <Box p="md" pb={0}>
        Loading...
      </Box>
    );
  }

  return (
    <Box p="md" pb={0}>
      {JSON.stringify(data, null, 2)}
    </Box>
  );
};

function getDistributionQuery(
  query: Lib.Query,
  stageIndex: number,
  column: DatasetColumn | undefined,
): Lib.Query {
  if (!column) {
    return query;
  }

  const drills = Lib.availableDrillThrus(
    query,
    stageIndex,
    undefined,
    column,
    undefined,
    undefined,
    undefined,
  );
  const distributionDrill = drills.find(drill => {
    const info = Lib.displayInfo(query, stageIndex, drill);
    return info.type === "drill-thru/distribution";
  });

  if (!distributionDrill) {
    return query;
  }

  return Lib.drillThru(query, stageIndex, undefined, distributionDrill);
}
