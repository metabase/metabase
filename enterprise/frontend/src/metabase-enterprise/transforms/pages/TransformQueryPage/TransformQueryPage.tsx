import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type {
  DraftTransformSource,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import { useSourceState } from "../../hooks/use-source-state";
import {
  type TransformEditorValue,
  useTransformEditor,
} from "../../hooks/use-transform-editor";
import { getTransformUrl } from "../../urls";

type TransformQueryPageParams = {
  transformId: string;
};

type TransformQueryPageProps = {
  params: TransformQueryPageParams;
};

export function TransformQueryPage({ params }: TransformQueryPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken);

  if (isLoading || error || transform == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  return <TransformQueryPageBody transform={transform} />;
}

type TransformQueryPageBodyProps = {
  transform: Transform;
};

function TransformQueryPageBody({ transform }: TransformQueryPageBodyProps) {
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const { setSource, proposedSource, acceptProposed, clearProposed } =
    useSourceState(transform.id, transform.source);
  const transformEditor = useTransformEditor(transform.source, proposedSource);
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

  return (
    <>
      <TransformSourceEditor
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

interface TransformSourceEditorProps {
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

function TransformSourceEditor({
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
}: TransformSourceEditorProps) {
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
