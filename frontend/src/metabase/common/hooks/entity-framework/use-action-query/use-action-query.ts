import type {
  UseEntityQueryProps,
  UseEntityQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-query";
import { useEntityQuery } from "metabase/common/hooks/entity-framework/use-entity-query";
import Actions from "metabase/entities/actions";
import type { WritebackAction, WritebackActionId } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useActionQuery = (
  props: UseEntityQueryProps<WritebackActionId, unknown> = {},
): UseEntityQueryResult<WritebackAction> => {
  return useEntityQuery(props, {
    fetch: Actions.actions.fetch,
    getObject: Actions.selectors.getObject,
    getLoading: Actions.selectors.getLoading,
    getError: Actions.selectors.getError,
  });
};
