import { useMemo, useState } from "react";
import _ from "underscore";

import {
  TransformQueryPageEditor,
  type TransformQueryPageEditorUiState,
} from "metabase-enterprise/transforms/pages/TransformQueryPage/TransformQueryPage";
import type { DatasetQuery, DraftTransformSource } from "metabase-types/api";

type TransformEditorProps = {
  disabled: boolean;
  source: DraftTransformSource;
  onChange: (source: DraftTransformSource) => void;
  proposedSource?: DraftTransformSource;
  onAcceptProposed?: () => void;
  onRejectProposed?: () => void;
  onRunQueryStart?: (query: DatasetQuery) => void;
  onRunTransform?: (result: any) => void;
};

export function TransformEditor({
  disabled,
  source,
  onChange,
  proposedSource,
  onAcceptProposed,
  onRejectProposed,
  onRunQueryStart,
  onRunTransform,
}: TransformEditorProps) {
  const [uiState, setUiState] = useState(getInitialUiStateForTransform);

  const uiOptions = useMemo(
    () => ({
      canChangeDatabase: false,
      readOnly: disabled,
      hidePreview: true,
    }),
    [disabled],
  );

  const handleSourceChange = (source: DraftTransformSource) => {
    onChange?.(source);
  };

  return (
    <TransformQueryPageEditor
      source={source}
      proposedSource={proposedSource}
      isDirty={false}
      uiState={uiState}
      setUiState={setUiState}
      uiOptions={uiOptions}
      databases={[]}
      setSourceAndRejectProposed={handleSourceChange}
      acceptProposed={onAcceptProposed ?? _.noop}
      rejectProposed={onRejectProposed ?? _.noop}
      onRunQueryStart={onRunQueryStart}
      onRunTransform={onRunTransform}
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
