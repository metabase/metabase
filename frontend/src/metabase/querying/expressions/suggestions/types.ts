import type {
  Completion as CodeMirrorCompletion,
  CompletionResult as CodeMirrorCompletionResult,
} from "@codemirror/autocomplete";

import type * as Lib from "metabase-lib";
import type { IconName } from "metabase-types/api";

export type ExpressionSuggestion = CodeMirrorCompletion & {
  icon: IconName;
  matches?: [number, number][];
  column?: Lib.ColumnMetadata;
  /** Other names that autocomplete matches, like "find" for `contains`. */
  aliases?: string[];
  /** Why the option matches, when its label does not show it. */
  hint?: string;
};

export type CompletionResult = CodeMirrorCompletionResult & {
  options: ExpressionSuggestion[];
};
