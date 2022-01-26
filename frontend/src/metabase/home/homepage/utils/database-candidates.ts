import { isSyncCompleted } from "metabase/lib/syncing";
import { Dashboard, Database } from "metabase-types/api";

export const createCandidatesQuery = (
  databases: Database[] = [],
  dashboards?: Dashboard[],
  showXrays = false,
  enableXrays = false,
) => {
  const userDatabase = databases.find(d => !d.is_sample && isSyncCompleted(d));

  if (!dashboards || dashboards.length || !showXrays || !enableXrays) {
    return;
  } else if (userDatabase) {
    return { id: userDatabase.id };
  }
};
