import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import type {
  ClickActionModeGetter,
  ClickActionProps,
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
 * and answers hasColumnShortcutActions from the query mode's legacy actions (see ClickActionModeGetter).
 */
export function queryModeToClickActionMode(
  queryMode: QueryClickActionsMode,
): ClickActionModeGetter {
  return Object.assign(
    ({ question }: { question: Question }) => new Mode(question, queryMode),
    {
      hasColumnShortcutActions: (props: ClickActionProps) =>
        queryMode.clickActions.some((action) => action(props)?.length > 0),
    },
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
