import { noop } from "underscore";

import { ObjectDetailWrapper } from "./ObjectDetailWrapper";
import type { ObjectDetailProps } from "./types";
import { getIdValue, getSingleResultsRow } from "./utils";

type ObjectDetailControlKey =
  | "question"
  | "table"
  | "tableForeignKeys"
  | "tableForeignKeyReferences"
  | "zoomedRow"
  | "zoomedRowID"
  | "canZoom"
  | "canZoomPreviousRow"
  | "canZoomNextRow"
  | "fetchTableFks"
  | "loadObjectDetailFKReferences"
  | "followForeignKey"
  | "viewPreviousObjectDetail"
  | "viewNextObjectDetail"
  | "closeObjectDetail"
  | "onActionSuccess";

type OwnProps = Omit<ObjectDetailProps, ObjectDetailControlKey>;

export function ObjectDetail(props: OwnProps) {
  const { data } = props;
  const zoomedRowID = getIdValue({ data });
  const zoomedRow = getSingleResultsRow(data);

  return (
    <ObjectDetailWrapper
      {...props}
      zoomedRow={zoomedRow}
      zoomedRowID={zoomedRowID ?? undefined}
      canZoom={false}
      canZoomPreviousRow={false}
      canZoomNextRow={false}
      fetchTableFks={noop}
      loadObjectDetailFKReferences={noop}
      followForeignKey={noop}
      viewPreviousObjectDetail={noop}
      viewNextObjectDetail={noop}
      closeObjectDetail={noop}
      onActionSuccess={noop}
    />
  );
}
