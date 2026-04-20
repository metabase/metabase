import {
  type ObjectDetailControls,
  useObjectDetailControls,
} from "./ObjectDetailControlsContext";
import { ObjectDetailWrapper } from "./ObjectDetailWrapper";
import type { ObjectDetailProps } from "./types";
import { getIdValue, getSingleResultsRow } from "./utils";

type OwnProps = Omit<ObjectDetailProps, keyof ObjectDetailControls>;

export function ObjectDetail(props: OwnProps) {
  const controls = useObjectDetailControls();
  const {
    question,
    table,
    tableForeignKeys,
    tableForeignKeyReferences,
    zoomedObjectId,
    zoomedRow: contextZoomedRow,
    canZoomPreviousRow,
    canZoomNextRow,
    fetchTableFks,
    loadObjectDetailFKReferences,
    followForeignKey,
    viewPreviousObjectDetail,
    viewNextObjectDetail,
    closeObjectDetail,
    onActionSuccess,
  } = controls;

  const { data } = props;
  const isZooming = zoomedObjectId != null;
  const zoomedRowID = isZooming
    ? zoomedObjectId
    : getIdValue({ data, tableId: table?.id });

  const zoomedRow = isZooming ? contextZoomedRow : getSingleResultsRow(data);
  const canZoom = isZooming && !!zoomedRow;

  return (
    <ObjectDetailWrapper
      {...props}
      question={question}
      table={table}
      tableForeignKeys={tableForeignKeys}
      tableForeignKeyReferences={tableForeignKeyReferences ?? undefined}
      zoomedRowID={zoomedRowID ?? undefined}
      zoomedRow={zoomedRow}
      canZoom={canZoom}
      canZoomPreviousRow={isZooming && !!canZoomPreviousRow}
      canZoomNextRow={isZooming && !!canZoomNextRow}
      fetchTableFks={fetchTableFks}
      loadObjectDetailFKReferences={loadObjectDetailFKReferences}
      followForeignKey={followForeignKey}
      viewPreviousObjectDetail={viewPreviousObjectDetail}
      viewNextObjectDetail={viewNextObjectDetail}
      closeObjectDetail={closeObjectDetail}
      onActionSuccess={onActionSuccess}
    />
  );
}
