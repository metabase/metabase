import { useMemo } from "react";

import { useSelector } from "metabase/lib/redux";
import { PLUGIN_TRANSFORMS_PYTHON } from "metabase/plugins";
import { getMetadata } from "metabase/selectors/metadata";
import { PaneHeaderActions } from "metabase-enterprise/data-studio/common/components/PaneHeader";
import { getIsRemoteSyncReadOnly } from "metabase-enterprise/remote_sync/selectors";
import { EditDefinitionButton } from "metabase-enterprise/transforms/components/TransformEditor/EditDefinitionButton";
import { getValidationResult } from "metabase-enterprise/transforms/utils";
import * as Lib from "metabase-lib";
import type {
  DraftTransformSource,
  Transform,
  TransformId,
} from "metabase-types/api";

type Props = {
  handleCancel: VoidFunction;
  handleSave: () => Promise<void>;
  isDirty: boolean;
  isEditMode: boolean;
  isSaving: boolean;
  readOnly?: boolean;
  source: DraftTransformSource;
  transform: Transform;
  transformId: TransformId;
};

export const TransformPaneHeaderActions = (props: Props) => {
  const {
    isDirty,
    source,
    handleSave,
    handleCancel,
    isSaving,
    isEditMode,
<<<<<<< HEAD
    transform,
=======
    readOnly,
    transformId,
>>>>>>> master
  } = props;
  const metadata = useSelector(getMetadata);
  const isRemoteSyncReadOnly = useSelector(getIsRemoteSyncReadOnly);

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

<<<<<<< HEAD
  if (!isEditMode && !isPythonTransform && !isNative && !isRemoteSyncReadOnly) {
    return <EditDefinitionButton transformId={transform.id} />;
=======
  if (
    !readOnly &&
    !isPythonTransform &&
    !isNative &&
    !isEditMode &&
    !isRemoteSyncReadOnly
  ) {
    return <EditDefinitionButton transformId={transformId} />;
  }

  if (!isEditMode && isNative) {
    return null;
>>>>>>> master
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
