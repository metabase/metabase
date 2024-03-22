import type {
  EntityQueryOptions,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import Fields from "metabase/entities/fields";
import type { FieldId, FieldValuesResponse } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const useFieldValuesQuery = (
  props: UseEntityQueryProps<FieldId>,
): UseEntityQueryResult<FieldValuesResponse> => {
  return useEntityQuery(props, {
    fetch: Fields.actions.fetchFieldValues,
    getObject,
    getLoading: Fields.selectors.getLoading,
    getError: Fields.selectors.getError,
    requestType: "values",
  });
};

function getObject(
  state: State,
  options: EntityQueryOptions<FieldId>,
): FieldValuesResponse | undefined {
  const field = Fields.selectors.getObject(state, options);
  if (field) {
    const { id, values, has_more_values } = field;
    return { field_id: id, values, has_more_values };
  } else {
    return undefined;
  }
}
