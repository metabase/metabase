import { connect } from "react-redux";

import { State } from "metabase-types/store";
import Tables from "metabase/entities/tables";
import {
  closeObjectDetail,
  followForeignKey,
  loadObjectDetailFKReferences,
  viewNextObjectDetail,
  viewPreviousObjectDetail,
} from "metabase/query_builder/actions";
import {
  getCanZoomNextRow,
  getCanZoomPreviousRow,
  getQuestion,
  getTableForeignKeyReferences,
  getTableForeignKeys,
  getTableMetadata,
  getZoomRow,
  getZoomedObjectId,
} from "metabase/query_builder/selectors";
import { getUser } from "metabase/selectors/user";
import ForeignKey from "metabase-lib/metadata/ForeignKey";

import { ObjectDetailWrapper } from "./ObjectDetailWrapper";
import type { ObjectDetailProps, ObjectId } from "./types";
import { getIdValue, getSingleResultsRow } from "./utils";

const mapStateToProps = (state: State, { data }: ObjectDetailProps) => {
  const isLoggedIn = !!getUser(state);

  if (!isLoggedIn) {
    return {};
  }

  const table = getTableMetadata(state);
  let zoomedRowID = getZoomedObjectId(state);
  const isZooming = zoomedRowID != null;

  if (!isZooming) {
    zoomedRowID = getIdValue({ data, tableId: table?.id });
  }

  const zoomedRow = isZooming ? getZoomRow(state) : getSingleResultsRow(data);
  const canZoomPreviousRow = isZooming ? getCanZoomPreviousRow(state) : false;
  const canZoomNextRow = isZooming ? Boolean(getCanZoomNextRow(state)) : false;

  return {
    // FIXME: remove the non-null assertion operator
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    question: getQuestion(state)!,
    table,
    tableForeignKeys: getTableForeignKeys(state),
    tableForeignKeyReferences: getTableForeignKeyReferences(state),
    zoomedRowID,
    zoomedRow,
    canZoom: isZooming && !!zoomedRow,
    canZoomPreviousRow,
    canZoomNextRow,
  };
};

// ugh, using function form of mapDispatchToProps here due to circlular dependency with actions
const mapDispatchToProps = (dispatch: any) => ({
  fetchTableFks: (id: number) =>
    dispatch(Tables.objectActions.fetchForeignKeys({ id })),
  loadObjectDetailFKReferences: (args: any) =>
    dispatch(loadObjectDetailFKReferences(args)),
  followForeignKey: ({
    objectId,
    fk,
  }: {
    objectId: ObjectId;
    fk: ForeignKey;
  }) => dispatch(followForeignKey({ objectId, fk })),
  viewPreviousObjectDetail: () => dispatch(viewPreviousObjectDetail()),
  viewNextObjectDetail: () => dispatch(viewNextObjectDetail()),
  closeObjectDetail: () => dispatch(closeObjectDetail()),
});

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(ObjectDetailWrapper);
