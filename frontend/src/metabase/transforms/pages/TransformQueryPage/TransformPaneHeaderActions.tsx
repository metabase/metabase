import { useMemo } from "react";

import { PaneHeaderActions } from "metabase/data-studio/common/components/PaneHeader";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_REMOTE_SYNC, PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import { EditDefinitionButton } from "metabase/transforms/components/TransformEditor/EditDefinitionButton";
import { getValidationResult } from "metabase/transforms/utils";
import * as Lib from "metabase-lib";
import type { DraftTransformSource, Transform } from "metabase-types/api";

type Props = {
  handleCancel: VoidFunction;
  handleSave: () => Promise<void>;
  isDirty: boolean;
  isEditMode: boolean;
  isSaving: boolean;
  readOnly?: boolean;
  source: DraftTransformSource;
  transform: Transform;
};

export const TransformPaneHeaderActions = (props: Props) => {
  const {
    isDirty,
    source,
    handleSave,
    handleCancel,
    isSaving,
    isEditMode,
    transform,
    readOnly,
  } = props;
  const metadata = useSelector(getMetadata);
  const isRemoteSyncReadOnly = useSelector(
    PLUGIN_REMOTE_SYNC.getIsRemoteSyncReadOnly,
  );

  const { validationResult, isNative } = useMemo(() => {
    if (source.type === "query") {
      const libQuery = Lib.fromJsQueryAndMetadata(metadata, source.query);
      const validationResult = getValidationResult(libQuery);
      return {
        validationResult,
        isNative: Lib.queryDisplayInfo(libQuery).isNative,
      };
    }

    return {
      validationResult:
        PLUGIN_TRANSFORMS_PYTHON.getPythonSourceValidationResult(source),
      isNative: false,
    };
  }, [source, metadata]);
  const isPythonTransform = source.type === "python";

  if (
    !readOnly &&
    !isPythonTransform &&
    !isNative &&
    !isEditMode &&
    !isRemoteSyncReadOnly
  ) {
    return <EditDefinitionButton transformId={transform.id} />;
  }

  if (!isEditMode && isNative) {
    return null;
  }

  return (
    <PaneHeaderActions
      alwaysVisible={isEditMode}
      errorMessage={validationResult.errorMessage}
      isDirty={isDirty}
      isSaving={isSaving}
      isValid={validationResult.isValid}
      onCancel={handleCancel}
      onSave={handleSave}
    />
  );
};
