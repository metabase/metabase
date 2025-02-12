import { useEffect, useMemo, useState } from "react";

import Tables from "metabase/entities/tables";
import { defer } from "metabase/lib/promise";
import { useSelector } from "metabase/lib/redux";
import {
  getDatabaseId,
  getTable,
  getTableId,
} from "metabase/reference/selectors";
import { getQuestion } from "metabase/reference/utils";
import { getMetadata } from "metabase/selectors/metadata";
import { runQuestionQuery } from "metabase/services";
import {
  extractRemappings,
  getVisualizationTransformed,
} from "metabase/visualizations";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import Table from "metabase/visualizations/visualizations/Table";

const TableDataContainerInner = props => {
  const metadata = useSelector(getMetadata);
  const databaseId = useSelector(state => getDatabaseId(state, props));
  const table = useSelector(state => getTable(state, props));

  const [result, setResult] = useState<any[] | null>(null);

  const adhocTableCard = useMemo(() => {
    if (table && metadata.tables[table.id]) {
      return getQuestion({ dbId: databaseId, tableId: table.id, metadata });
    }
  }, [table, databaseId, metadata]);

  // useEffect(() => {
  //   registerVisualization(Table);
  // }, []);

  useEffect(() => {
    if (adhocTableCard) {
      runQuestionQuery(adhocTableCard, {
        cancelDeferred: defer(),
        ignoreCache: false,
      }).then(data => {
        setResult(data);
      });
    }
  }, [adhocTableCard]);

  if (!result) {
    return null;
  }

  const transformedSeries = result
    ? getVisualizationTransformed(extractRemappings(result))
    : null;
  const transformedSettings = getComputedSettingsForSeries(transformedSeries);

  return (
    <Table
      card={transformedSeries[0].card}
      data={transformedSeries[0].data}
      series={transformedSeries}
      settings={transformedSettings}
      // height={}
      // isPivoted={}
      // className={}
      // onVisualizationClick={}
      // visualizationIsClickable={}
      // getColumnTitle={}
      // getExtraDataForClick={}
    />
  );
};

export const TableDataContainer = Tables.load({
  id: getTableId,
  loadingAndErrorWrapper: false,
})(TableDataContainerInner);
