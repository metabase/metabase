import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { ModelIndexes } from "metabase/entities/model-indexes";
import type { ModelIndex, ModelIndexesListQuery } from "metabase-types/api";

export const useModelIndexesListQuery = (
  props: UseEntityListQueryProps<ModelIndexesListQuery> = {},
): UseEntityListQueryResult<ModelIndex> => {
  return useEntityListQuery(props, {
    fetchList: ModelIndexes.actions.fetchList,
    getList: ModelIndexes.selectors.getList,
    getLoading: ModelIndexes.selectors.getLoading,
    getLoaded: ModelIndexes.selectors.getLoaded,
    getError: ModelIndexes.selectors.getError,
    getListMetadata: ModelIndexes.selectors.getListMetadata,
  });
};
