import type { WritebackAction } from "metabase-types/api";

import { isEditableActionDatabase } from "../utils";

import { useActionDatabases } from "./use-action-databases";

export function useActionPermissions(action: WritebackAction | undefined) {
  const { databases, isLoading, error } = useActionDatabases();

  return {
    databases: databases.filter(isEditableActionDatabase),
    readOnly: !action?.can_write,
    isLoading,
    error,
  };
}
