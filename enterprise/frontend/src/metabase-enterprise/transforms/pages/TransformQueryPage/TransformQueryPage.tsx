import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { QueryEditorContextValue } from "metabase-enterprise/transforms/hooks/use-query-editor";
import type { Transform, TransformSource } from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import { getTransformUrl } from "../../urls";

export function TransformQueryPage({
  transform,
  setSource,
  proposedSource,
  acceptProposed,
  clearProposed,
  queryEditor,
}: {
  transform: Transform;
  setSource: (source: TransformSource) => void;
  proposedSource: TransformSource | undefined;
  acceptProposed: (source: TransformSource) => void;
  clearProposed: () => void;
  queryEditor: QueryEditorContextValue;
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
    onError: () => {
      sendErrorToast(t`Failed to update transform query`);
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

  if (transform.source.type === "python") {
    return (
      <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
        transform={transform}
        initialSource={transform.source}
        proposedSource={
          proposedSource?.type === "python" ? proposedSource : undefined
        }
        isNew={false}
        isSaving={isSaving}
        onSave={handleSaveSource}
        onCancel={handleCancel}
        onRejectProposed={clearProposed}
        onAcceptProposed={acceptProposed}
      />
    );
  }

  return (
    <>
      <QueryEditor
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
        queryEditor={queryEditor}
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
