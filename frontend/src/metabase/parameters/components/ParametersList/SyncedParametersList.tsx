import { useMemo } from "react";

import { useSyncedQueryString } from "metabase/hooks/use-synced-query-string";
import type { ParametersListProps } from "metabase/parameters/components/ParametersList/types";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";

import { ParametersList } from "./ParametersList";
import { useSelector } from "react-redux";
import { withRouter } from "react-router";

export const SyncedParametersList = withRouter<ParametersListProps>(
  ({
    parameters,
    editingParameter,
    question,
    dashboard,

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

    location,
  }) => {
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
  },
);
