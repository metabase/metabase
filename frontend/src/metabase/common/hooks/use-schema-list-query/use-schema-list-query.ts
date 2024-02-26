import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import Schemas from "metabase/entities/schemas";
import Schema from "metabase-lib/metadata/Schema";
import { SchemaListQuery } from "metabase-types/api";

export const useSchemaListQuery = (
  props: UseEntityListQueryProps<SchemaListQuery> = {},
): UseEntityListQueryResult<Schema> => {
  return useEntityListQuery(props, {
    fetchList: Schemas.actions.fetchList,
    getList: Schemas.selectors.getList,
    getLoading: Schemas.selectors.getLoading,
    getLoaded: Schemas.selectors.getLoaded,
    getError: Schemas.selectors.getError,
  });
};
