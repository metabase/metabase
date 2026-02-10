import { useMemo, useState } from "react";
import _ from "underscore";

import {
  TransformQueryPageEditor,
  type TransformQueryPageEditorUiState,
} from "metabase/transforms/pages/TransformQueryPage/TransformQueryPage";
import type { DatasetQuery, DraftTransformSource } from "metabase-types/api";

type TransformEditorProps = {
  disabled: boolean;
  hideRunButton?: boolean;
  source: DraftTransformSource;
  onChange: (source: DraftTransformSource) => void;
  proposedSource?: DraftTransformSource;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
  onRunQueryStart?: (query: DatasetQuery) => boolean | void;
  onRunTransform?: (result: any) => void;
  /** Custom run handler for Python transforms (used for dry-run) */
  onRun?: () => void;
};

export function TransformEditor({
  disabled,
  hideRunButton,
  source,
  onChange,
  proposedSource,
  onAcceptProposed,
  onRejectProposed,
  onRunQueryStart,
  onRunTransform,
  onRun,
}: TransformEditorProps) {
  const [uiState, setUiState] = useState(getInitialUiStateForTransform);

  const uiOptions = useMemo(
    () => ({
      canChangeDatabase: false,
      readOnly: disabled,
      hidePreview: true,
      hideRunButton,
      resizable: false,
    }),
    [disabled, hideRunButton],
  );

  const handleSourceChange = (source: DraftTransformSource) => {
    onChange?.(source);
  };

  return (
    <TransformQueryPageEditor
      source={source}
      proposedSource={proposedSource}
      uiState={uiState}
      setUiState={setUiState}
      uiOptions={uiOptions}
      databases={[]}
      isEditMode={true}
      setSourceAndRejectProposed={handleSourceChange}
      acceptProposed={onAcceptProposed ?? _.noop}
      rejectProposed={onRejectProposed ?? _.noop}
      onRunQueryStart={onRunQueryStart}
      onRunTransform={onRunTransform}
      onRun={onRun}
    />
  );
}

function getInitialUiStateForTransform(): TransformQueryPageEditorUiState {
  return {
    lastRunResult: null,
    lastRunQuery: null,
    selectionRange: [],
    modalSnippet: null,
    sidebarType: null,
    modalType: null,
  };
}
