import type {
  Completion as CodeMirrorCompletion,
  CompletionResult as CodeMirrorCompletionResult,
} from "@codemirror/autocomplete";

// eslint-disable-next-line no-restricted-imports
import type { IconName } from "metabase/ui";
import type * as Lib from "metabase-lib";

export type Completion = CodeMirrorCompletion & {
  icon: IconName;
  matches?: [number, number][];
  column?: Lib.ColumnMetadata;
};

export type CompletionResult = CodeMirrorCompletionResult & {
  options: Completion[];
};
