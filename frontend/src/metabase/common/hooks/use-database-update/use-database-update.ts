import Databases from "metabase/entities/databases";
import {
  EntityInfo,
  useEntityUpdate,
} from "metabase/common/hooks/use-entity-update";
import { DatabaseData, DatabaseId } from "metabase-types/api";
import Database from "metabase-lib/metadata/Database";

export const useDatabaseUpdate = () => {
  return useEntityUpdate<
    DatabaseId,
    Database,
    EntityInfo<DatabaseId>,
    DatabaseData
  >({
    update: Databases.actions.update,
    getObject: Databases.selectors.getObject,
  });
};
