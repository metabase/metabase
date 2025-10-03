import type { Location } from "history";
import type { Route } from "react-router";
import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { AdminSettingsLayout } from "metabase/common/components/AdminLayout/AdminSettingsLayout";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { useRegisterMetabotContextProvider } from "metabase/metabot";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import {
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import { useSourceState } from "metabase-enterprise/transforms/hooks/use-source-state";
import type {
  DraftTransformSource,
  Transform,
  TransformSource,
} from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
import { getTransformUrl } from "../../urls";

type TransformQueryPageParams = {
  transformId: string;
};

type TransformQueryPageProps = {
  params: TransformQueryPageParams;
  location: Location;
  route: Route;
};

export function TransformQueryPage({
  params,
  location,
  route,
}: TransformQueryPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken);

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transform == null) {
    return <LoadingAndErrorWrapper error={t`Transform not found.`} />;
  }

  return (
    <TransformQueryPageBody
      transform={transform}
      location={location}
      route={route}
    />
  );
}

type TransformQueryPageBodyProps = {
  transform: Transform;
  location: Location;
  route: Route;
};

export function TransformQueryPageBody({
  transform,
  location,
  route,
}: TransformQueryPageBodyProps) {
  const [updateTransform, { isLoading: isSaving }] =
    useUpdateTransformMutation();
  const dispatch = useDispatch();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const { setSource, proposedSource, acceptProposed, clearProposed, isDirty } =
    useSourceState<DraftTransformSource>(transform.id, transform.source);

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
        isSaving={isLoading}
        onSave={handleSourceSave}
        onCancel={handleCancel}
        onRejectProposed={onRejectProposed}
        onAcceptProposed={onAcceptProposed}
      />
    );
  }

  return (
    <>
      <QueryEditor
        initialSource={transform.source}
        transform={transform}
        initialSource={transform.source}
        proposedSource={proposedSource}
        isSaving={isSaving || isCheckingDependencies}
        onChange={setSource}
        onSave={handleSaveSource}
        onCancel={handleCancel}
        onRejectProposed={clearProposed}
        onAcceptProposed={acceptProposed}
      />
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCloseConfirmation}
        />
      )}
      <LeaveRouteConfirmModal
        key={location.key}
        isEnabled={isDirty}
        route={route}
        onConfirm={clearProposed}
      />
    </AdminSettingsLayout>
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
    />
  );
}
