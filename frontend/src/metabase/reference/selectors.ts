import { createSelector } from "@reduxjs/toolkit";
import { getIn } from "icepick";

import type { State } from "metabase/redux/store";

// A `type`, not an `interface`, so `useParams<ReferenceRouteParams>()` accepts
// it: the hook's constraint needs an implicit index signature.
export type ReferenceRouteParams = {
  segmentId?: string;
  databaseId?: string;
  tableId?: string;
  fieldId?: string;
};

export interface ReferenceRouteProps {
  params: ReferenceRouteParams;
}

interface ReferenceSliceState {
  isEditing: boolean;
  isFormulaExpanded: boolean;
}

// The `reference` and `revisions` slices are wired in via `reducers-main.ts`
// but aren't declared on the global `State` type. Adding them centrally
// triggers a TS2589 ("excessively deep") cascade in dashboard's reducers,
// so we widen locally here instead.
export type StateWithReference = State & {
  reference: ReferenceSliceState;
  revisions?: Record<string, Record<string | number, unknown>>;
};

export { getUser } from "metabase/current-user";

export const getSegmentId = (_state: State, props: ReferenceRouteProps) =>
  Number.parseInt(props.params.segmentId ?? "");
export const getDatabaseId = (_state: State, props: ReferenceRouteProps) =>
  Number.parseInt(props.params.databaseId ?? "");

export const getTableId = (_state: State, props: ReferenceRouteProps) =>
  Number.parseInt(props.params.tableId ?? "");

export const getFieldId = (_state: State, props: ReferenceRouteProps) =>
  Number.parseInt(props.params.fieldId ?? "");

const getRevisions = (state: State) =>
  // Unjustified type cast. FIXME
  (state as StateWithReference).revisions;

export const getSegmentRevisions = createSelector(
  [getSegmentId, getRevisions],
  (segmentId, revisions) => getIn(revisions, ["segment", segmentId]) || {},
);

export const getIsEditing = (state: State) =>
  // Unjustified type cast. FIXME
  (state as StateWithReference).reference.isEditing;

export const getIsFormulaExpanded = (state: State) =>
  // Unjustified type cast. FIXME
  (state as StateWithReference).reference.isFormulaExpanded;
