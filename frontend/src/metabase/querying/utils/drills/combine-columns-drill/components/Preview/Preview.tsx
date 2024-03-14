import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { getQueryResults } from "metabase/query_builder/selectors";
import { Box } from "metabase/ui";
import type * as Lib from "metabase-lib";

import type { ColumnAndSeparator } from "../../types";
import { extractQueryResults, getPreview } from "../../utils";

// import styles from './Preview.module.css';

const PREVIEW_SIZE = 3;

interface Props {
  columnsAndSeparators: ColumnAndSeparator[];
  drill: Lib.DrillThru;
  query: Lib.Query;
  stageIndex: number;
}

export const Preview = ({
  columnsAndSeparators,
  drill,
  query,
  stageIndex,
}: Props) => {
  const datasets = useSelector(getQueryResults);
  const queryResults = useMemo(
    () => extractQueryResults(datasets).slice(0, PREVIEW_SIZE),
    [datasets],
  );
  const values = useMemo(
    () =>
      getPreview(query, stageIndex, drill, columnsAndSeparators, queryResults),
    [query, stageIndex, drill, columnsAndSeparators, queryResults],
  );

  if (values.length === 0) {
    return null;
  }

  return (
    <Box>
      {values.map((value, index) => (
        <Box key={index}>{value}</Box>
      ))}
    </Box>
  );
};
