import type { MetabasePluginsConfig } from "metabase/embedding-sdk/types/plugins";
import { EmbeddingSdkStaticMode } from "metabase/visualizations/click-actions/modes/EmbeddingSdkStaticMode";
import type { QueryClickActionsMode } from "metabase/visualizations/types";
import type Question from "metabase-lib/v1/Question";

import { Mode } from "../Mode";
import { ArchivedMode } from "../modes/ArchivedMode";
import { DefaultMode } from "../modes/DefaultMode";
import { EmbeddingSdkMode } from "../modes/EmbeddingSdkMode";
import { ListMode } from "../modes/ListMode";

export function getMode(question: Question): Mode | null {
  if (question.isArchived()) {
    return new Mode(question, ArchivedMode);
  }
  const queryMode = question.display() === "list" ? ListMode : DefaultMode;
  return new Mode(question, queryMode);
}

export function getEmbeddingMode({
  question,
  queryMode,
  isStaticEmbedding,
  plugins,
}: {
  question: Question;
  queryMode?: QueryClickActionsMode;
  isStaticEmbedding?: boolean;
  plugins?: MetabasePluginsConfig;
}): Mode {
  queryMode =
    queryMode ??
    (isStaticEmbedding ? EmbeddingSdkStaticMode : EmbeddingSdkMode);

  return new Mode(question, queryMode, plugins);
}
