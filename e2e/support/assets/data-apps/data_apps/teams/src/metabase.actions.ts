import { defineAction } from "@metabase/embedding-sdk-react/data-app";

import { schema } from "./metabase.schema";

export const addTeam = defineAction({
  entityId: "teamsAppAddTeam000001",
  kind: "row/create",
  table: schema.tables.scoreboardActions,
});
