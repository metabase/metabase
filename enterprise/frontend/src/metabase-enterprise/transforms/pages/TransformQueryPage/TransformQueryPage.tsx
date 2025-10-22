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

export interface TransformQueryPageHandlers {
  handleSaveSource: (source: TransformSource) => Promise<void>;
  handleCancel: () => void;
  isSaving: boolean;
  checkData: any;
  isConfirmationShown: boolean;
  handleSaveAfterConfirmation: () => void;
  handleCloseConfirmation: () => void;
}

export function useTransformQueryPageHandlers({
  transform,
  setSource,
  clearProposed,
}: {
  transform: Transform;
  setSource: (source: DraftTransformSource) => void;
  clearProposed: () => void;
}): TransformQueryPageHandlers {
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
    setSource(transform.source);
    clearProposed();
    dispatch(push(getTransformUrl(transform.id)));
  };

  return {
    handleSaveSource,
    handleCancel,
    isSaving: isSaving || isCheckingDependencies,
    checkData,
    isConfirmationShown,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  };
}

export function TransformQueryPage({
  transform,
  setSource,
  proposedSource,
  acceptProposed,
  clearProposed,
  transformEditor,
  onSave,
  onCancel,
  isSaving = false,
}: {
  transform: Transform;
  setSource: (source: DraftTransformSource) => void;
  proposedSource: TransformSource | undefined;
  acceptProposed: (source: TransformSource) => void;
  clearProposed: () => void;
  transformEditor: TransformEditorValue;
  onSave?: (source: TransformSource) => Promise<void>;
  onCancel?: () => void;
  isSaving?: boolean;
}) {
  const internalHandlers = useTransformQueryPageHandlers({
    transform,
    setSource,
    clearProposed,
  });

  const handleSaveSource = onSave ?? internalHandlers.handleSaveSource;
  const handleCancel = onCancel ?? internalHandlers.handleCancel;
  const actualIsSaving = isSaving || internalHandlers.isSaving;

  return (
    <>
      <TransformEditorBody
        transform={transform}
        initialSource={transform.source}
        proposedSource={
          proposedSource?.type === "query" ? proposedSource : undefined
        }
        isSaving={actualIsSaving}
        onChange={setSource}
        onSave={handleSaveSource}
        onCancel={handleCancel}
        onRejectProposed={clearProposed}
        onAcceptProposed={acceptProposed}
        transformEditor={transformEditor}
      />
      {internalHandlers.isConfirmationShown && internalHandlers.checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={internalHandlers.checkData}
          opened
          onSave={internalHandlers.handleSaveAfterConfirmation}
          onClose={internalHandlers.handleCloseConfirmation}
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
