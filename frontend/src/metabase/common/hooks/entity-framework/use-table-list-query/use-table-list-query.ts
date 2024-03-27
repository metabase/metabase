import type {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/entity-framework/use-entity-list-query";
import { useEntityListQuery } from "metabase/common/hooks/entity-framework/use-entity-list-query";
import Tables from "metabase/entities/tables";
import type Table from "metabase-lib/v1/metadata/Table";
import type { TableListQuery } from "metabase-types/api";

/**
 * @deprecated use "metabase/api" instead
 */
export const useTableListQuery = (
  props: UseEntityListQueryProps<TableListQuery> = {},
): UseEntityListQueryResult<Table> => {
  return useEntityListQuery(props, {
    fetchList: Tables.actions.fetchList,
    getList: Tables.selectors.getList,
    getLoading: Tables.selectors.getLoading,
    getLoaded: Tables.selectors.getLoaded,
    getError: Tables.selectors.getError,
    getListMetadata: Tables.selectors.getListMetadata,
  });
};
