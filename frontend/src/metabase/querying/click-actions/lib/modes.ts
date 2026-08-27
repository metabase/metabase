import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import type {
  ClickActionModeGetter,
  QueryClickActionsMode,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import { Mode } from "../Mode";
import { ArchivedMode } from "../modes/ArchivedMode";
import { DefaultMode } from "../modes/DefaultMode";
import { ListMode } from "../modes/ListMode";

export function getMode(question: Question): Mode {
  if (question.isArchived()) {
    return new Mode(question, ArchivedMode);
  }
  const queryMode = question.display() === "list" ? ListMode : DefaultMode;
  return new Mode(question, queryMode);
}

/**
 * The stock drill behaviour, for surfaces with no mode of their own.
 * Visualization has no built-in default: passing this is opting in.
 */
export const getDefaultClickActionMode: ClickActionModeGetter = ({
  question,
}) => getMode(question);

/**
 * Adapts a bare QueryClickActionsMode to Visualization's mode prop:
 * the getter wraps the clicked question per click,
 * and advertises the query mode's actions for hosts that probe them (see ClickActionModeGetter).
 */
export function queryModeToClickActionMode(
  queryMode: QueryClickActionsMode,
): ClickActionModeGetter {
  return Object.assign(
    ({ question }: { question: Question }) => new Mode(question, queryMode),
    { clickActions: queryMode.clickActions },
  );
}

export function getEmbeddingMode({
  question,
  queryMode,
  plugins,
}: {
  question: Question;
  queryMode: QueryClickActionsMode;
  plugins?: MetabasePluginsConfig;
}): Mode {
  return new Mode(question, queryMode, plugins);
}
