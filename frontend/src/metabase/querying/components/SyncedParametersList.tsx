import { useCallback } from "react";

import {
  ParametersList,
  type ParametersListProps,
} from "metabase/parameters/components/ParametersList";
import type { ParameterId } from "metabase-types/api";

import { useSyncUrlParameters } from "./use-sync-url-parameters";

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
  useSyncUrlParameters({ parameters });

  const setParameterToDefaultValue = useCallback(
    (parameterId: ParameterId) => {
      const parameter = parameters.find(({ id }) => id === parameterId);
      const defaultValue = parameter?.default;
      if (defaultValue && setParameterValue) {
        setParameterValue(parameterId, defaultValue);
      }
    },
    [parameters, setParameterValue],
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
      setParameterValueToDefault={setParameterToDefaultValue}
      enableParameterRequiredBehavior={enableParameterRequiredBehavior}
    />
  );
};
