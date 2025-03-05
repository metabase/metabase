import { useMemo } from "react";
import { t } from "ttag";

import type { NumberOrEmptyValue } from "metabase/querying/filters/hooks/use-number-filter";
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

  return (
    <div>{JSON.stringify(Lib.toLegacyQuery(distributionQuery), null, 2)}</div>
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
