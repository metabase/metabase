import { noop } from "underscore";

import { ObjectDetailWrapper } from "./ObjectDetailWrapper";
import type { ObjectDetailProps } from "./types";
import { getIdValue, getSingleResultsRow } from "./utils";

/**
 * Keys the query builder injects when it renders the interactive object-detail
 * modal (see `query_builder/.../ObjectDetailModal`). The registered "object"
 * visualization — used on dashboards, in public/embedded views, and as the QB's
 * main result viz — never has these, so they're omitted here and stubbed below.
 * This keeps the visualization free of any `query_builder` dependency.
 */
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
