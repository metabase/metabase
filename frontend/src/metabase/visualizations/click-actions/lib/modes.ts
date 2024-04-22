import type { SdkClickActionExtensionsConfig } from "embedding-sdk/lib/question-extensions";
import type Question from "metabase-lib/v1/Question";

import { Mode } from "../Mode";
import { DefaultMode } from "../modes/DefaultMode";
import { EmbeddingSdkMode } from "../modes/EmbeddingSdkMode";

export function getMode(question: Question): Mode | null {
  return new Mode(question, DefaultMode);
}

export function getEmbeddingMode(
  question: Question,
  extensions?: SdkClickActionExtensionsConfig,
): Mode | null {
  return new Mode(question, EmbeddingSdkMode, extensions);
}
