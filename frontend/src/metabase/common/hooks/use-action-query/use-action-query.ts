import { WritebackAction, WritebackActionId } from "metabase-types/api";
import {
  UseEntityQueryProps,
  UseEntityQueryResult,
  useEntityQuery,
} from "metabase/common/hooks/use-entity-query";
import Actions from "metabase/entities/actions";

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
