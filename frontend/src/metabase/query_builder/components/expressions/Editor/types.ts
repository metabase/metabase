import type {
  Completion as CodeMirrorCompletion,
  CompletionResult as CodeMirrorCompletionResult,
} from "@codemirror/autocomplete";

import type { IconName } from "metabase/ui";

export type Completion = CodeMirrorCompletion & {
  icon: IconName;
  matches?: [number, number][];
};

export type CompletionResult = CodeMirrorCompletionResult & {
  options: Completion[];
};
