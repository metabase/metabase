import { createEntity } from "metabase/lib/entities";
import { AutoApi } from "metabase/services";

const DatabaseCandidates = createEntity({
  name: "databaseCandidates",
  api: {
    list: AutoApi.db_candidates,
  },
});

export default DatabaseCandidates;
