import { Mode } from "metabase/visualizations/click-actions/Mode";
import { ArchivedMode } from "metabase/visualizations/click-actions/modes/ArchivedMode";
import { DefaultMode } from "metabase/visualizations/click-actions/modes/DefaultMode";
import { ListMode } from "metabase/visualizations/click-actions/modes/ListMode";
import type {
  ClickActionModeGetter,
  QueryClickActionsMode,
} from "metabase/visualizations/types";

import { DashboardClickAction } from "./DashboardClickAction";

const DashboardDefaultMode: QueryClickActionsMode = {
  ...DefaultMode,
  clickActions: [...(DefaultMode.clickActions ?? []), DashboardClickAction],
};

// Mirrors getMode from metabase/visualizations/click-actions/lib/modes, with
// the dashboard-owned click-behavior action added for regular dashcards.
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
