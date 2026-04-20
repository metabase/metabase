import { createContext, useContext } from "react";
import { noop } from "underscore";

import type Question from "metabase-lib/v1/Question";
import type ForeignKey from "metabase-lib/v1/metadata/ForeignKey";
import type Table from "metabase-lib/v1/metadata/Table";
import type { RowValue } from "metabase-types/api";

import type { ForeignKeyReferences, ObjectId } from "./types";

export interface ObjectDetailControls {
  question?: Question;
  table?: Table | null;
  tableForeignKeys?: ForeignKey[];
  tableForeignKeyReferences?: ForeignKeyReferences;
  zoomedObjectId?: ObjectId;
  zoomedRow?: RowValue[];
  canZoomPreviousRow?: boolean;
  canZoomNextRow?: boolean;
  rowIndexToPkMap?: Record<number, ObjectId>;
  fetchTableFks: (id: number) => void;
  loadObjectDetailFKReferences: (opts: { objectId: ObjectId }) => void;
  followForeignKey: (opts: { objectId: ObjectId; fk: ForeignKey }) => void;
  viewPreviousObjectDetail: () => void;
  viewNextObjectDetail: () => void;
  closeObjectDetail: () => void;
  zoomInRow: (opts: { objectId: ObjectId }) => void;
  resetRowZoom: () => void;
  onActionSuccess: () => void;
}

const DEFAULT_CONTROLS: ObjectDetailControls = {
  fetchTableFks: noop,
  loadObjectDetailFKReferences: noop,
  followForeignKey: noop,
  viewPreviousObjectDetail: noop,
  viewNextObjectDetail: noop,
  closeObjectDetail: noop,
  zoomInRow: noop,
  resetRowZoom: noop,
  onActionSuccess: noop,
};

export const ObjectDetailControlsContext =
  createContext<ObjectDetailControls>(DEFAULT_CONTROLS);

export const useObjectDetailControls = () =>
  useContext(ObjectDetailControlsContext);
