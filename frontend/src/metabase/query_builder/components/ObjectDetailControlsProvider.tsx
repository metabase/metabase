import { type ReactNode, useMemo } from "react";

import { Tables } from "metabase/entities/tables";
import {
  closeObjectDetail,
  followForeignKey,
  loadObjectDetailFKReferences,
  resetRowZoom,
  runQuestionQuery,
  viewNextObjectDetail,
  viewPreviousObjectDetail,
  zoomInRow,
} from "metabase/query_builder/actions";
import {
  getCanZoomNextRow,
  getCanZoomPreviousRow,
  getQuestion,
  getRowIndexToPKMap,
  getTableForeignKeyReferences,
  getTableForeignKeys,
  getTableMetadata,
  getZoomRow,
  getZoomedObjectId,
} from "metabase/query_builder/selectors";
import { getUser } from "metabase/selectors/user";
import { useDispatch, useSelector } from "metabase/utils/redux";
import {
  type ObjectDetailControls,
  ObjectDetailControlsContext,
} from "metabase/visualizations/components/ObjectDetail/ObjectDetailControlsContext";
import type { ObjectId } from "metabase/visualizations/components/ObjectDetail/types";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";

interface Props {
  children: ReactNode;
}

export function ObjectDetailControlsProvider({ children }: Props) {
  const dispatch = useDispatch();
  const isLoggedIn = useSelector((state) => !!getUser(state));
  const question = useSelector(getQuestion);
  const table = useSelector(getTableMetadata);
  const tableForeignKeys = useSelector(getTableForeignKeys);
  const tableForeignKeyReferences = useSelector(getTableForeignKeyReferences);
  const zoomedObjectId = useSelector(getZoomedObjectId);
  const zoomedRow = useSelector(getZoomRow);
  const canZoomPreviousRow = useSelector(getCanZoomPreviousRow);
  const canZoomNextRow = useSelector(getCanZoomNextRow);
  const rowIndexToPkMap = useSelector(getRowIndexToPKMap);

  const value = useMemo<ObjectDetailControls>(() => {
    if (!isLoggedIn) {
      return {
        fetchTableFks: () => {},
        loadObjectDetailFKReferences: () => {},
        followForeignKey: () => {},
        viewPreviousObjectDetail: () => {},
        viewNextObjectDetail: () => {},
        closeObjectDetail: () => {},
        zoomInRow: () => {},
        resetRowZoom: () => {},
        onActionSuccess: () => {},
      };
    }
    return {
      question,
      table,
      tableForeignKeys,
      tableForeignKeyReferences: tableForeignKeyReferences ?? undefined,
      zoomedObjectId: zoomedObjectId ?? undefined,
      zoomedRow,
      canZoomPreviousRow,
      canZoomNextRow: Boolean(canZoomNextRow),
      rowIndexToPkMap,
      fetchTableFks: (id: number) =>
        dispatch(Tables.objectActions.fetchForeignKeys({ id })),
      loadObjectDetailFKReferences: (opts: { objectId: ObjectId }) =>
        dispatch(loadObjectDetailFKReferences(opts)),
      followForeignKey: (opts: { objectId: ObjectId; fk: ForeignKey }) =>
        dispatch(followForeignKey(opts)),
      viewPreviousObjectDetail: () => dispatch(viewPreviousObjectDetail()),
      viewNextObjectDetail: () => dispatch(viewNextObjectDetail()),
      closeObjectDetail: () => dispatch(closeObjectDetail()),
      zoomInRow: (opts: { objectId: ObjectId }) => dispatch(zoomInRow(opts)),
      resetRowZoom: () => dispatch(resetRowZoom()),
      onActionSuccess: () => dispatch(runQuestionQuery()),
    };
  }, [
    isLoggedIn,
    dispatch,
    question,
    table,
    tableForeignKeys,
    tableForeignKeyReferences,
    zoomedObjectId,
    zoomedRow,
    canZoomPreviousRow,
    canZoomNextRow,
    rowIndexToPkMap,
  ]);

  return (
    <ObjectDetailControlsContext.Provider value={value}>
      {children}
    </ObjectDetailControlsContext.Provider>
  );
}
