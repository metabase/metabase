import querystring from "querystring";
import { useCallback, useEffect, useMemo } from "react";

import { IS_EMBED_PREVIEW } from "metabase/lib/embed";
import { useDispatch } from "metabase/lib/redux";
import {
  ParametersList,
  type ParametersListProps,
} from "metabase/parameters/components/ParametersList";
import { getParameterValuesBySlug } from "metabase-lib/v1/parameters/utils/parameter-values";
import type { ParameterId } from "metabase-types/api";

import { setParameterValueToDefault } from "../actions";

export const SyncedParametersList = ({
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
  enableParameterRequiredBehavior,
}: ParametersListProps) => {
  const dispatch = useDispatch();
  const queryParams = useMemo(
    () => getParameterValuesBySlug(parameters),
    [parameters],
  );

  useEffect(() => {
    /**
     * We don't want to sync the query string to the URL because when previewing,
     * this changes the URL of the iframe by appending the query string to the src.
     * This causes the iframe to reload when changing the preview hash from appearance
     * settings because now the base URL (including the query string) is different.
     */
    if (IS_EMBED_PREVIEW) {
      return;
    }
    const searchString = buildSearchString(queryParams);
    if (searchString !== window.location.search) {
      window.history.replaceState(
        null,
        document.title,
        window.location.pathname + searchString + window.location.hash,
      );
    }
  }, [queryParams]);

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
      setParameterValueToDefault={dispatchSetParameterValueToDefault}
      enableParameterRequiredBehavior={enableParameterRequiredBehavior}
    />
  );
};

const QUERY_PARAMS_ALLOW_LIST = ["objectId", "locale"];

function buildSearchString(object: Record<string, any>) {
  const currentSearchParams = querystring.parse(
    window.location.search.replace("?", ""),
  );
  const filteredSearchParams = Object.fromEntries(
    Object.entries(currentSearchParams).filter((entry) =>
      QUERY_PARAMS_ALLOW_LIST.includes(entry[0]),
    ),
  );

  const search = querystring.stringify({
    ...filteredSearchParams,
    ...object,
  });
  return search ? `?${search}` : "";
}
