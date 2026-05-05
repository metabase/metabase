import type {
  Completion as CodeMirrorCompletion,
  CompletionResult as CodeMirrorCompletionResult,
} from "@codemirror/autocomplete";

import type { IconName } from "metabase/ui";
import type * as Lib from "metabase-lib";

export type ExpressionSuggestion = CodeMirrorCompletion & {
  icon: IconName;
  matches?: [number, number][];
  column?: Lib.ColumnMetadata;
};

export type CompletionResult = CodeMirrorCompletionResult & {
  options: ExpressionSuggestion[];
};
