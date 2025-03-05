import { useMemo } from "react";

import { useGetAdhocQueryQuery } from "metabase/api";
import { useSelector } from "metabase/lib/redux";
import type { NumberOrEmptyValue } from "metabase/querying/filters/hooks/use-number-filter";
import { getMetadata } from "metabase/selectors/metadata";
import { Box } from "metabase/ui";
import Visualization from "metabase/visualizations/components/Visualization";
import * as Lib from "metabase-lib";
import Question from "metabase-lib/v1/Question";
import type { DatasetColumn, RawSeries } from "metabase-types/api";

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
  const metadata = useSelector(getMetadata);
  const question = useMemo(() => {
    return new Question(distributionQuery, metadata).setDisplay("bar");
  }, [distributionQuery, metadata]);

  const { data, isLoading } = useGetAdhocQueryQuery(legacyQuery);
  const rawSeries = useMemo<RawSeries | undefined>(() => {
    if (!data) {
      return undefined;
    }

    return [
      {
        data: data.data,
        card: question.card(),
      },
    ];
  }, [data, question]);

  if (isLoading) {
    return (
      <Box p="md" pb={0}>
        Loading...
      </Box>
    );
  }

  return (
    <Box p="md" pb={0}>
      <Visualization rawSeries={rawSeries} />
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
