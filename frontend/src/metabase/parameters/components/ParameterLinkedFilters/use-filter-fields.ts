import { useCallback, useState } from "react";
import { t } from "ttag";
import { DashboardApi } from "metabase/services";
import { useOnMount } from "metabase/hooks/use-on-mount";
import { FieldId } from "metabase-types/api";
import { UiParameter } from "metabase-lib/parameters/types";

export interface UseFilterFieldsState {
  data?: FieldId[][];
  error?: string;
  loading: boolean;
}

const useFilterFields = (
  parameter: UiParameter,
  otherParameter: UiParameter,
): UseFilterFieldsState => {
  const [state, setState] = useState<UseFilterFieldsState>({ loading: false });

  const handleLoad = useCallback(async () => {
    const filtered = getParameterFieldIds(parameter);
    const filtering = getParameterFieldIds(otherParameter);

    if (!filtered.length || !filtered.length) {
      const errorParameter = !filtered.length ? parameter : otherParameter;
      const error = getParameterError(errorParameter);
      setState({ error, loading: false });
    } else {
      setState({ loading: true });
      const request = { filtered, filtering };
      const response = await DashboardApi.validFilterFields(request);
      setState({ data: getParameterMapping(response), loading: false });
    }
  }, [parameter, otherParameter]);

  useOnMount(() => {
    handleLoad();
  });

  return state;
};

const getParameterError = ({ name }: UiParameter) => {
  return t`To view this, ${name} must be connected to at least one field.`;
};

const getParameterFieldIds = (parameter: UiParameter) => {
  if ("fields" in parameter) {
    return parameter.fields.map(field => field.id);
  } else {
    return [];
  }
};

const getParameterMapping = (data: Record<FieldId, FieldId[]>) => {
  return Object.entries(data).flatMap(([filteredId, filteringIds]) =>
    filteringIds.map(filteringId => [filteringId, parseInt(filteredId, 10)]),
  );
};

export default useFilterFields;
