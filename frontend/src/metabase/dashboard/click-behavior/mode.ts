import { Mode } from "metabase/querying/click-actions/Mode";
import { ArchivedMode } from "metabase/querying/click-actions/modes/ArchivedMode";
import { DefaultMode } from "metabase/querying/click-actions/modes/DefaultMode";
import { ListMode } from "metabase/querying/click-actions/modes/ListMode";
import type { QueryClickActionsMode } from "metabase/querying/click-actions/types";
import type { ClickActionsMode } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import { DashboardClickAction } from "./DashboardClickAction";

const DashboardDefaultMode: QueryClickActionsMode = {
  ...DefaultMode,
  clickActions: [...DefaultMode.clickActions, DashboardClickAction],
};

function getDashboardQueryMode(question: Question): QueryClickActionsMode {
  if (question.isArchived()) {
    return ArchivedMode;
  }
  return question.display() === "list" ? ListMode : DashboardDefaultMode;
}

// Mirrors getQueryMode from metabase/querying/click-actions/lib/modes,
// with the dashboard-owned click-behavior action added for regular dashcards.
export const dashboardClickActionMode: ClickActionsMode = new Mode(
  getDashboardQueryMode,
);
