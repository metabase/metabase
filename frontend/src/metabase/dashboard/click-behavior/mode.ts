import { Mode } from "metabase/querying/click-actions/Mode";
import { ArchivedMode } from "metabase/querying/click-actions/modes/ArchivedMode";
import { DefaultMode } from "metabase/querying/click-actions/modes/DefaultMode";
import { ListMode } from "metabase/querying/click-actions/modes/ListMode";
import type {
  ClickActionModeGetter,
  QueryClickActionsMode,
} from "metabase/visualizations/types";

import { DashboardClickAction } from "./DashboardClickAction";

const DashboardDefaultMode: QueryClickActionsMode = {
  ...DefaultMode,
  clickActions: [...(DefaultMode.clickActions ?? []), DashboardClickAction],
};

// Mirrors getMode from metabase/querying/click-actions/lib/modes,
// with the dashboard-owned click-behavior action added for regular dashcards.
export const getDashboardClickActionMode: ClickActionModeGetter = ({
  question,
}) => {
  if (question.isArchived()) {
    return new Mode(question, ArchivedMode);
  }

  const queryMode =
    question.display() === "list" ? ListMode : DashboardDefaultMode;

  return new Mode(question, queryMode);
};
