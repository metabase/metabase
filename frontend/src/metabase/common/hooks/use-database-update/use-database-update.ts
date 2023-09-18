import Databases from "metabase/entities/databases";
import type { EntityInfo } from "metabase/common/hooks/use-entity-update";
import { useEntityUpdate } from "metabase/common/hooks/use-entity-update";
import type { DatabaseData, DatabaseId } from "metabase-types/api";
import type Database from "metabase-lib/metadata/Database";

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
