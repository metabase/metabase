import { useCallback, useMemo } from "react";
import { noop } from "underscore";

import { useDispatch, useSelector } from "metabase/redux";
import { ObjectDetailWrapper } from "metabase/visualizations/components/ObjectDetail/ObjectDetailWrapper";
import {
  getIdValue,
  getSingleResultsRow,
} from "metabase/visualizations/components/ObjectDetail/utils";
import { getComputedSettingsForSeries } from "metabase/visualizations/lib/settings/visualization";

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

/**
 * The interactive object-detail modal shown in the query builder. It owns all
 * the query-builder wiring (zoom navigation, refresh-after-action) and renders
 * the presentational `ObjectDetailWrapper` from the visualizations module.
 *
 * Dashboards/public/embedding render object detail statically through the
 * registered "object" visualization instead; this component is QB-only.
 */
export function ObjectDetailModal() {
  // Cheap gate: only subscribe to the zoom/result selectors below when object
  // detail is actually being shown, so this always-mounted component doesn't do
  // work on every query builder render.
  const isObjectDetail = useSelector(getIsObjectDetail);

  if (!isObjectDetail) {
    return null;
  }

  return <ObjectDetailModalInner />;
}

function ObjectDetailModalInner() {
  const dispatch = useDispatch();
  const rawSeries = useSelector(getRawSeries);
  const question = useSelector(getQuestion);
  const table = useSelector(getTableMetadata);
  const zoomedObjectId = useSelector(getZoomedObjectId);
  const zoomRow = useSelector(getZoomRow);
  const canZoomPreviousRow = useSelector(getCanZoomPreviousRow);
  const canZoomNextRow = useSelector(getCanZoomNextRow);

  const objectDetailSeries = useMemo(() => {
    if (!rawSeries?.[0]) {
      return undefined;
    }
    const [first] = rawSeries;
    return [{ ...first, card: { ...first.card, display: "object" as const } }];
  }, [rawSeries]);

  const settings = useMemo(
    () => getComputedSettingsForSeries(objectDetailSeries),
    [objectDetailSeries],
  );

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

  if (!objectDetailSeries) {
    return null;
  }

  const data = objectDetailSeries[0].data;
  const isZooming = zoomedObjectId != null;
  const zoomedRowID = isZooming
    ? zoomedObjectId
    : getIdValue({ data, tableId: table?.id });
  const zoomedRow = isZooming ? zoomRow : getSingleResultsRow(data);
  const canZoom = isZooming && !!zoomedRow;

  return (
    <ObjectDetailWrapper
      isObjectDetail
      data={data}
      settings={settings}
      question={question}
      table={table}
      zoomedRow={zoomedRow}
      zoomedRowID={zoomedRowID ?? undefined}
      canZoom={canZoom}
      canZoomPreviousRow={isZooming && !!canZoomPreviousRow}
      canZoomNextRow={isZooming && !!canZoomNextRow}
      viewPreviousObjectDetail={onViewPrevious}
      viewNextObjectDetail={onViewNext}
      closeObjectDetail={onClose}
      onActionSuccess={onActionSuccess}
      // FK navigation in the modal is handled by DetailViewSidesheet via RTK
      // Query; these presentational props are only used by the static path.
      fetchTableFks={noop}
      loadObjectDetailFKReferences={noop}
      followForeignKey={noop}
      onVisualizationClick={noop}
      visualizationIsClickable={() => false}
      isDashboard={false}
    />
  );
}
