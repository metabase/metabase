import { useCallback, useLayoutEffect, useState } from "react";
import { t } from "ttag";
import { DashboardApi } from "metabase/services";
import { UiParameter } from "metabase-lib/parameters/types";

export interface UseFilterFieldsState {
  data?: Record<string, string[]>;
  error?: string;
  loading: boolean;
}

const useFilterFields = (
  parameter: UiParameter,
  otherParameter: UiParameter,
  isExpanded: boolean,
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
      setState({ data: response, loading: false });
    }
  }, [parameter, otherParameter]);

  const handleReset = useCallback(() => {
    setState({ loading: false });
  }, []);

  useLayoutEffect(() => {
    if (isExpanded) {
      handleLoad();
    } else {
      handleReset();
    }
  }, [isExpanded, handleLoad, handleReset]);

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

export default useFilterFields;
