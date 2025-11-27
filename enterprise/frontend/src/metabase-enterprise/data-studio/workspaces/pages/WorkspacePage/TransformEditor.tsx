import { useState } from "react";
import _ from "underscore";

import {
  TransformQueryPageEditor,
  type TransformQueryPageEditorUiState,
} from "metabase-enterprise/transforms/pages/TransformQueryPage/TransformQueryPage";
import type { DraftTransformSource } from "metabase-types/api";

type TransformEditorProps = {
  source: DraftTransformSource;
};

export function TransformEditor({ source }: TransformEditorProps) {
  const [uiState, setUiState] = useState(getInitialUiStateForTransform);
  const [uiOptions] = useState({
    canChangeDatabase: false,
  });

  return (
    <TransformQueryPageEditor
      source={source}
      isDirty={false}
      uiState={uiState}
      setUiState={setUiState}
      uiOptions={uiOptions}
      databases={[]}
      setSourceAndRejectProposed={_.noop}
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
