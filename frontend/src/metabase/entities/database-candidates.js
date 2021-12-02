import { createEntity } from "metabase/lib/entities";
import { AutoApi } from "metabase/services";

const DatabaseCandidates = createEntity({
  name: "databaseCandidates",
  api: {
    list: async (query = {}) => {
      return query.id ? AutoApi.db_candidates(query) : [];
    },
  },
});

export default DatabaseCandidates;
