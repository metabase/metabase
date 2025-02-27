import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import type { QueryClickActionsMode } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import { Mode } from "../Mode";
import { ArchivedMode } from "../modes/ArchivedMode";
import { DefaultMode } from "../modes/DefaultMode";
import { EmbeddingSdkMode } from "../modes/EmbeddingSdkMode";

export function getMode(question: Question): Mode | null {
  const queryMode = question.isArchived() ? ArchivedMode : DefaultMode;
  return new Mode(question, queryMode);
}

export function getEmbeddingMode({
  question,
  queryMode = EmbeddingSdkMode,
  plugins,
}: {
  question: Question;
  queryMode?: QueryClickActionsMode;
  plugins?: MetabasePluginsConfig;
}): Mode {
  return new Mode(question, queryMode, plugins);
}
