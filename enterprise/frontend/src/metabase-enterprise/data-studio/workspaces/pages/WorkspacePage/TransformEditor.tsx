import { useMemo, useState } from "react";
import _ from "underscore";

import {
  TransformQueryPageEditor,
  type TransformQueryPageEditorUiState,
} from "metabase-enterprise/transforms/pages/TransformQueryPage/TransformQueryPage";
import type { DraftTransformSource } from "metabase-types/api";

type TransformEditorProps = {
  disabled: boolean;
  source: DraftTransformSource;
  onChange: (source: DraftTransformSource) => void;
};

export function TransformEditor({
  disabled,
  source,
  onChange,
}: TransformEditorProps) {
  const [uiState, setUiState] = useState(getInitialUiStateForTransform);
  const uiOptions = useMemo(
    () => ({
      canChangeDatabase: false,
      readOnly: disabled,
    }),
    [disabled],
  );

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
