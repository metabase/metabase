import type { MetabasePluginsConfig } from "embedding-sdk/lib/plugins";
import type Question from "metabase-lib/v1/Question";

import { Mode } from "../Mode";
import { ArchivedMode } from "../modes/ArchivedMode";
import { DefaultMode } from "../modes/DefaultMode";
import { EmbeddingSdkMode } from "../modes/EmbeddingSdkMode";

export function getMode(question: Question): Mode | null {
  const queryMode = question.isArchived() ? ArchivedMode : DefaultMode;
  return new Mode(question, queryMode);
}

export function getEmbeddingMode(
  question: Question,
  plugins?: MetabasePluginsConfig,
): Mode | null {
  return new Mode(question, EmbeddingSdkMode, plugins);
}
