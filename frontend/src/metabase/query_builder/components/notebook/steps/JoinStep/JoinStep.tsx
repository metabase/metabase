import type { NotebookStepUiComponentProps } from "../../types";

import { JoinDraft } from "./JoinDraft";

export function JoinStep({
  query,
  stageIndex,
  color,
  readOnly = false,
}: NotebookStepUiComponentProps) {
  return (
    <JoinDraft
      query={query}
      stageIndex={stageIndex}
      color={color}
      readOnly={readOnly}
    />
  );
}
