import Fields from "metabase/entities/fields";
import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/use-entity-query";
import type { FieldId, FieldValue } from "metabase-types/api";

export const useFieldValuesQuery = (
  props: UseEntityQueryProps<FieldId>,
): UseEntityQueryResult<FieldValue[]> => {
  return useEntityQuery(props, {
    fetch: Fields.actions.fetchFieldValues,
    getObject: Fields.selectors.getFieldValues,
    getLoading: Fields.selectors.getLoading,
    getError: Fields.selectors.getError,
    requestType: "values",
  });
};
