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
};

export type CompletionResult = CodeMirrorCompletionResult & {
  options: ExpressionSuggestion[];
};
