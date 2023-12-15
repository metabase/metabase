import Fields from "metabase/entities/fields";
import type {
  EntityQueryOptions,
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import type { FieldId, FieldValuesResult } from "metabase-types/api";
import type { State } from "metabase-types/store";

export const useFieldValuesQuery = (
  props: UseEntityQueryProps<FieldId>,
): UseEntityQueryResult<FieldValuesResult> => {
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
): FieldValuesResult | undefined {
  const field = Fields.selectors.getObject(state, options);
  if (field) {
    const { id, values, has_more_values } = field;
    return { field_id: id, values, has_more_values };
  } else {
    return undefined;
  }
}
