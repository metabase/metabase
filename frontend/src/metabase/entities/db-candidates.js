import { createEntity } from "metabase/lib/entities";
import { AutoApi } from "metabase/services";

const DbCandidates = createEntity({
  name: "dbCandidates",
  api: {
    list: AutoApi.db_candidates,
  },
});

export default DbCandidates;
