import { useMemo } from "react";
import { withRouter, type WithRouterProps } from "react-router";
import _ from "underscore";

import { useSyncedQueryString } from "metabase/hooks/use-synced-query-string";
import type { ParametersListProps } from "metabase/parameters/components/ParametersList/types";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";

import { ParametersList } from "./ParametersList";

const _SyncedParametersList = ({
  parameters,
  editingParameter,
  question,
  dashboard,
  location,

  className,
  hideParameters,

  isFullscreen,
  isNightMode,
  isEditing,
  commitImmediately,

  setParameterValue,
  setParameterIndex,
  setEditingParameter,
  setParameterValueToDefault,
  enableParameterRequiredBehavior,
}: ParametersListProps & WithRouterProps) => {
  const queryParams = useMemo(
    () => getParameterValuesBySlug(parameters),
    [parameters],
  );

  useSyncedQueryString(queryParams, location);

  return (
    <ParametersList
      className={className}
      parameters={parameters}
      question={question}
      dashboard={dashboard}
      editingParameter={editingParameter}
      isFullscreen={isFullscreen}
      isNightMode={isNightMode}
      hideParameters={hideParameters}
      isEditing={isEditing}
      commitImmediately={commitImmediately}
      setParameterValue={setParameterValue}
      setParameterIndex={setParameterIndex}
      setEditingParameter={setEditingParameter}
      setParameterValueToDefault={setParameterValueToDefault}
      enableParameterRequiredBehavior={enableParameterRequiredBehavior}
    />
  );
};

export const SyncedParametersList = withRouter<ParametersListProps>(
  _SyncedParametersList,
);
