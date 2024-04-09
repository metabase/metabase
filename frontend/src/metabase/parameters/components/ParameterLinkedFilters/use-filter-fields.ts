import { useCallback, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { DashboardApi } from "metabase/services";
import { getFields } from "metabase-lib/v1/parameters/utils/parameter-fields";
import type { FieldId, Parameter } from "metabase-types/api";

export interface UseFilterFieldsState {
  data?: FieldId[][];
  error?: string;
  loading: boolean;
}

const useFilterFields = (
  parameter: Parameter,
  otherParameter: Parameter,
): UseFilterFieldsState => {
  const [state, setState] = useState<UseFilterFieldsState>({ loading: false });

  const handleLoad = useCallback(async () => {
    const filtered = getFields(parameter).map(field => field.id);
    const filtering = getFields(otherParameter).map(field => field.id);

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

  useMount(() => {
    handleLoad();
  });

  return state;
};

const getParameterError = ({ name }: Parameter) => {
  return t`To view this, ${name} must be connected to at least one field.`;
};

const getParameterMapping = (data: Record<FieldId, FieldId[]>) => {
  return Object.entries(data).flatMap(([filteredId, filteringIds]) =>
    filteringIds.map(filteringId => [filteringId, parseInt(filteredId, 10)]),
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default useFilterFields;
