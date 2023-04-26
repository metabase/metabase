import Databases from "metabase/entities/databases";
import useEntityListQuery, {
  UseEntityListQueryProps,
  UseEntityListQueryResult,
} from "metabase/common/hooks/use-entity-list-query";
import { DatabaseListQuery } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";

const useDatabaseListQuery = (
  props: UseEntityListQueryProps<DatabaseListQuery> = {},
): UseEntityListQueryResult<Database> => {
  return useEntityListQuery(Databases, props);
};

export default useDatabaseListQuery;
