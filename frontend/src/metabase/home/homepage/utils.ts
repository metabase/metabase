import { isSyncCompleted } from "metabase/lib/syncing";
import { Database } from "./types";

export const createCandidatesQuery = (databases: Database[]) => {
  const sampleDatabase = databases.find(d => d.is_sample && isSyncCompleted(d));
  const userDatabase = databases.find(d => !d.is_sample && isSyncCompleted(d));

  if (userDatabase) {
    return { id: userDatabase.id };
  } else if (sampleDatabase) {
    return { id: sampleDatabase.id };
  }
};
