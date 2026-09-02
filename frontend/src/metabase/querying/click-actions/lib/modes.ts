import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import type {
  ClickActionsMode,
  QueryClickActionsMode,
} from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import { Mode } from "../Mode";
import { ArchivedMode } from "../modes/ArchivedMode";
import { DefaultMode } from "../modes/DefaultMode";
import { ListMode } from "../modes/ListMode";

export function getQueryMode(question: Question): QueryClickActionsMode {
  if (question.isArchived()) {
    return ArchivedMode;
  }
  return question.display() === "list" ? ListMode : DefaultMode;
}

export const defaultClickActionMode: ClickActionsMode = new Mode(getQueryMode);

export function getEmbeddingMode({
  queryMode,
  plugins,
}: {
  queryMode: QueryClickActionsMode;
  plugins?: MetabasePluginsConfig;
}): ClickActionsMode {
  return new Mode(() => queryMode, { plugins });
}
