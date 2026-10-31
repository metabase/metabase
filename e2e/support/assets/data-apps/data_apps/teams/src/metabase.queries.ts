import { defineQuery, orderBy } from "@metabase/embedding-sdk-react/data-app";

import { schema } from "./metabase.schema";

const teams = schema.tables.scoreboardActions;

export const teamList = defineQuery({
  entityId: "teamsAppTeamList00001",
  source: teams,
  fields: [teams.fields.teamName, teams.fields.score],
  orderBys: [orderBy(teams.fields.teamName, "asc")],
});
