import { useSetting } from "metabase/common/hooks";
import type { SyncableEntity } from "metabase-types/api";

export const useIsInLibrary = (entityType: SyncableEntity): boolean => {
  const setting = useSetting("git-sync-entities");

  return !!setting?.[entityType];
};
