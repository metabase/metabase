import type { WritebackAction } from "metabase-types/api";

import { isEditableActionDatabase } from "../utils";

import { useActionDatabases } from "./use-action-databases";

export function useActionPermissions(action: WritebackAction | undefined) {
  const { databases, isLoading, error } = useActionDatabases();
  const database = databases.find(
    (database) => database.id === action?.database_id,
  );
  const editableDatabases = databases.filter(isEditableActionDatabase);

  return {
    databases: editableDatabases,
    isActionsEnabled: database != null,
    readOnly: database == null || !isEditableActionDatabase(database),
    isLoading,
    error,
  };
}
