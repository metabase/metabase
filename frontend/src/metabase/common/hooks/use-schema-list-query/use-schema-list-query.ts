import Schemas from "metabase/entities/schemas";
import {
  useEntityListQuery,
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { SchemaListQuery } from "metabase-types/api";
import Schema from "metabase-lib/metadata/Schema";

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
