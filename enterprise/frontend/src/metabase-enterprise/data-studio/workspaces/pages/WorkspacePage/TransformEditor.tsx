import { useState } from "react";
import _ from "underscore";

import {
  TransformQueryPageEditor,
  type TransformQueryPageEditorUiState,
} from "metabase-enterprise/transforms/pages/TransformQueryPage/TransformQueryPage";
import type { DraftTransformSource } from "metabase-types/api";

type TransformEditorProps = {
  source: DraftTransformSource;
  onChange: (source: DraftTransformSource) => void;
};

export function TransformEditor({ source, onChange }: TransformEditorProps) {
  const [uiState, setUiState] = useState(getInitialUiStateForTransform);
  const [uiOptions] = useState({
    canChangeDatabase: false,
  });

  const handleSourceChange = (source: DraftTransformSource) => {
    onChange?.(source);
  };

  return (
    <TransformQueryPageEditor
      source={source}
      isDirty={false}
      uiState={uiState}
      setUiState={setUiState}
      uiOptions={uiOptions}
      databases={[]}
      setSourceAndRejectProposed={handleSourceChange}
      acceptProposed={_.noop}
      rejectProposed={_.noop}
    />
  );
}

function getInitialUiStateForTransform() {
  return {
    lastRunResult: null,
    lastRunQuery: null,
    selectionRange: [],
    modalSnippet: null,
    sidebarType: null,
    modalType: null,
  } as TransformQueryPageEditorUiState;
}
