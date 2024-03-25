import { createEntity } from "metabase/lib/entities";
import { AutoApi } from "metabase/services";

/**
 * @deprecated use "metabase/api" instead
 */
const DatabaseCandidates = createEntity({
  name: "databaseCandidates",
  api: {
    list: async (query = {}) => {
      return query.id ? AutoApi.db_candidates(query) : [];
    },
  },
});

export default DatabaseCandidates;
