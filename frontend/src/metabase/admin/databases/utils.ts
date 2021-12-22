import Settings from "metabase/lib/settings";
import { Database } from "./types";

export const createCandidatesQuery = (databases: Database[]) => {
  const sampleDatabase = databases.find(d => d.is_sample);
  const enableXrays = Settings.get("enable-xrays");

  if (sampleDatabase && enableXrays) {
    return { id: sampleDatabase.id };
  }
};
