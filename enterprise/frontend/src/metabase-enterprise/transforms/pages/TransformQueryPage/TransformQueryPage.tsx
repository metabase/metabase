import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { TransformEditorValue } from "metabase-enterprise/transforms/hooks/use-transform-editor";
import type {
  DraftTransformSource,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import { getTransformUrl } from "../../urls";

export function TransformQueryPage({
  transform,
  setSource,
  proposedSource,
  acceptProposed,
  clearProposed,
  transformEditor,
}: {
  transform: Transform;
  setSource: (source: TransformSource) => void;
  proposedSource: TransformSource | undefined;
  acceptProposed: (source: TransformSource) => void;
  clearProposed: () => void;
  transformEditor: TransformEditorValue;
}) {
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const {
    checkData,
    isCheckingDependencies,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  } = PLUGIN_DEPENDENCIES.useCheckTransformDependencies({
    onSave: async (request) => {
      const { error } = await updateTransform(request);
      if (error) {
        sendErrorToast(t`Failed to update transform query`);
      } else {
        sendSuccessToast(t`Transform query updated`);
        clearProposed();
        dispatch(push(getTransformUrl(transform.id)));
      }
    },
  });

  const handleSaveSource = async (source: TransformSource) => {
    await handleInitialSave({
      id: transform.id,
      source,
    });
  };

  const handleCancel = () => {
    // set to initial source to fix isDirty calc on route leave
    setSource(transform.source);
    clearProposed();
    dispatch(push(getTransformUrl(transform.id)));
  };

  return (
    <>
      <TransformEditorBody
        transform={transform}
        initialSource={transform.source}
        proposedSource={
          proposedSource?.type === "query" ? proposedSource : undefined
        }
        isSaving={isSaving || isCheckingDependencies}
        onChange={setSource}
        onSave={handleSaveSource}
        onCancel={handleCancel}
        onRejectProposed={clearProposed}
        onAcceptProposed={acceptProposed}
        transformEditor={transformEditor}
      />
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCloseConfirmation}
        />
      )}
    </>
  );
}

interface TransformEditorBodyProps {
  transform: Transform;
  initialSource: TransformSource;
  proposedSource?: TransformSource;
  isSaving?: boolean;
  onChange?: (source: DraftTransformSource) => void;
  onSave: (source: TransformSource) => void;
  onCancel: () => void;
  onRejectProposed?: () => void;
  onAcceptProposed?: (source: TransformSource) => void;
  transformEditor: TransformEditorValue;
}

function TransformEditorBody({
  transform,
  initialSource,
  proposedSource,
  isSaving,
  onChange,
  onSave,
  onCancel,
  onRejectProposed,
  onAcceptProposed,
  transformEditor,
}: TransformEditorBodyProps) {
  if (initialSource.type === "python") {
    return (
      <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
        transform={transform}
        initialSource={initialSource}
        proposedSource={
          proposedSource?.type === "python" ? proposedSource : undefined
        }
        isNew={false}
        isSaving={isSaving}
        onChange={onChange}
        onSave={onSave}
        onCancel={onCancel}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={onAcceptProposed}
      />
    );
  }

  return (
    <QueryEditor
      initialSource={initialSource}
      transform={transform}
      isNew={false}
      isSaving={isSaving}
      onSave={onSave}
      onChange={onChange}
      onCancel={onCancel}
      proposedSource={
        proposedSource?.type === "query" ? proposedSource : undefined
      }
      onRejectProposed={onRejectProposed}
      onAcceptProposed={onAcceptProposed}
      transformEditor={transformEditor}
    />
  );
}
