import { useCallback, useMemo } from "react";

import { skipToken, useListTableForeignKeysQuery } from "metabase/api";
import { DetailViewSidesheet } from "metabase/detail-view/components";
import { filterByPk } from "metabase/detail-view/utils";
import { useDispatch, useSelector } from "metabase/redux";
import {
  getApiTable,
  getIdValue,
  getRowUrl,
  getSingleResultsRow,
} from "metabase/visualizations/components/ObjectDetail/utils";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";
import { getColumnKey } from "metabase-lib/v1/queries/utils/column-key";

import {
  closeObjectDetail,
  runQuestionQuery,
  viewNextObjectDetail,
  viewPreviousObjectDetail,
} from "../actions";
import {
  getCanZoomNextRow,
  getCanZoomPreviousRow,
  getQuestion,
  getRawSeries,
  getTableMetadata,
  getZoomRow,
  getZoomedObjectId,
} from "../selectors";
import { getIsObjectDetail } from "../selectors/mode";

export function ObjectDetailSidesheet() {
  const isObjectDetail = useSelector(getIsObjectDetail);

  if (!isObjectDetail) {
    return null;
  }

  return <ObjectDetailSidesheetInner />;
}

function ObjectDetailSidesheetInner() {
  const dispatch = useDispatch();
  const rawSeries = useSelector(getRawSeries);
  const question = useSelector(getQuestion);
  const table = useSelector(getTableMetadata);
  const zoomedObjectId = useSelector(getZoomedObjectId);
  const zoomRow = useSelector(getZoomRow);
  const canZoomPreviousRow = useSelector(getCanZoomPreviousRow);
  const canZoomNextRow = useSelector(getCanZoomNextRow);

  const { data: tableForeignKeys } = useListTableForeignKeysQuery(
    table ? table.id : skipToken,
  );

  const data = useMemo(() => {
    const first = rawSeries?.[0];
    if (!first) {
      return undefined;
    }
    // Force "object" display so settings resolve the object-detail column config.
    const series = [
      { ...first, card: { ...first.card, display: "object" as const } },
    ];
    return { series, settings: getComputedSettingsForSeries(series) };
  }, [rawSeries]);

  const datasetData = data?.series[0].data;
  const columns = datasetData?.cols;
  const isZooming = zoomedObjectId != null;
  const zoomedRowID = isZooming
    ? zoomedObjectId
    : datasetData
      ? getIdValue({ data: datasetData, tableId: table?.id })
      : null;

  const filteredQuery = useMemo(() => {
    if (columns == null || zoomedRowID == null || question == null) {
      return undefined;
    }
    return filterByPk(question.query(), columns, zoomedRowID);
  }, [columns, zoomedRowID, question]);

  const onViewPrevious = useCallback(
    () => dispatch(viewPreviousObjectDetail()),
    [dispatch],
  );
  const onViewNext = useCallback(
    () => dispatch(viewNextObjectDetail()),
    [dispatch],
  );
  const onClose = useCallback(() => dispatch(closeObjectDetail()), [dispatch]);
  const onActionSuccess = useCallback(
    () => dispatch(runQuestionQuery()),
    [dispatch],
  );

  if (
    data == null ||
    datasetData == null ||
    columns == null ||
    zoomedRowID == null ||
    question == null
  ) {
    return null;
  }

  const { settings } = data;
  const zoomedRow = isZooming ? zoomRow : getSingleResultsRow(datasetData);
  const canZoom = isZooming && !!zoomedRow;
  const apiTable = getApiTable(table);
  const columnsSettings = columns.map(
    (column) => settings?.column_settings?.[getColumnKey(column)],
  );
  const showImplicitActions = Boolean(
    question.canWrite() &&
    question.type() === "model" &&
    question.supportsImplicitActions(),
  );

  return (
    <DetailViewSidesheet
      columnSettings={settings?.["table.columns"]}
      columns={columns}
      columnsSettings={columnsSettings}
      query={filteredQuery}
      row={zoomedRow}
      rowId={zoomedRowID}
      showImplicitActions={showImplicitActions}
      showNav={Boolean(canZoom && (canZoomNextRow || canZoomPreviousRow))}
      table={apiTable}
      tableForeignKeys={tableForeignKeys}
      url={getRowUrl(question, columns, apiTable, zoomedRowID)}
      onActionSuccess={onActionSuccess}
      onClose={onClose}
      onNextClick={canZoomNextRow ? onViewNext : undefined}
      onPreviousClick={canZoomPreviousRow ? onViewPrevious : undefined}
    />
  );
}
