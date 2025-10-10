import { useCallback } from "react";

import { useDispatch } from "metabase/lib/redux";
import {
  ParametersList,
  type ParametersListProps,
} from "metabase/parameters/components/ParametersList";
import type { ParameterId } from "metabase-types/api";

import { setParameterValueToDefault } from "../actions";
import { useSyncUrlParameters } from "../hooks/use-sync-url-parameters";

export const SyncedParametersList = ({
  parameters,
  editingParameter,
  cardId,
  dashboardId,

  className,
  hideParameters,

  isFullscreen,
  isEditing,
  isSortable,
  commitImmediately,

  setParameterValue,
  setParameterIndex,
  setEditingParameter,
  enableParameterRequiredBehavior,
}: ParametersListProps) => {
  const dispatch = useDispatch();

  useSyncUrlParameters({ parameters });

  const dispatchSetParameterValueToDefault = useCallback(
    (parameterId: ParameterId) => {
      dispatch(setParameterValueToDefault(parameterId));
    },
    [dispatch],
  );

  return (
    <ParametersList
      className={className}
      parameters={parameters}
      cardId={cardId}
      dashboardId={dashboardId}
      editingParameter={editingParameter}
      isFullscreen={isFullscreen}
      isSortable={isSortable}
      hideParameters={hideParameters}
      isEditing={isEditing}
      commitImmediately={commitImmediately}
      setParameterValue={setParameterValue}
      setParameterIndex={setParameterIndex}
      setEditingParameter={setEditingParameter}
      setParameterValueToDefault={dispatchSetParameterValueToDefault}
      enableParameterRequiredBehavior={enableParameterRequiredBehavior}
    />
  );
};
