import { useLayoutEffect, useMemo, useState } from "react";
import type { Route } from "react-router";
import { useLatest } from "react-use";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LeaveRouteConfirmModal } from "metabase/common/components/LeaveConfirmModal";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import {
  PLUGIN_DEPENDENCIES,
  PLUGIN_TRANSFORMS_PYTHON,
} from "metabase/plugins";
import { getInitialUiControls } from "metabase/querying/editor/components/QueryEditor";
import { Center } from "metabase/ui";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { DraftTransformSource, Transform } from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";
import { useTransformMetabot } from "../../hooks/use-transform-metabot";
import { isNotDraftSource, isSameSource } from "../../utils";

type TransformQueryPageParams = {
  transformId: string;
};

type TransformQueryPageProps = {
  params: TransformQueryPageParams;
  route: Route;
};

export function TransformQueryPage({ params, route }: TransformQueryPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken);

  if (isLoading || error || transform == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <TransformQueryPageBody transform={transform} route={route} />;
}

type TransformQueryPageBodyProps = {
  transform: Transform;
  route: Route;
};

function TransformQueryPageBody({
  transform,
  route,
}: TransformQueryPageBodyProps) {
  const [source, setSource] = useState<DraftTransformSource>(transform.source);
  const [uiControls, setUiControls] = useState(getInitialUiControls);
  const sourceRef = useLatest(transform.source);
  const [updateName] = useUpdateTransformMutation();
  const [updateSource, { isLoading: isSaving }] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();
  const { proposedSource, acceptProposed, rejectProposed } =
    useTransformMetabot(transform, source, setSource);

  const isSourceDirty = useMemo(
    () => !isSameSource(source, transform.source),
    [source, transform.source],
  );

  const {
    checkData,
    isCheckingDependencies,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCloseConfirmation,
  } = PLUGIN_DEPENDENCIES.useCheckTransformDependencies({
    onSave: async (request) => {
      const { error } = await updateSource(request);
      if (error) {
        sendErrorToast(t`Failed to update transform query`);
      } else {
        sendSuccessToast(t`Transform query updated`);
      }
    },
  });

  const handleNameChange = async (newName: string) => {
    const { error } = await updateName({
      id: transform.id,
      name: newName,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform name`);
    } else {
      sendSuccessToast(t`Transform name updated`);
    }
  };

  const handleSave = async () => {
    if (isNotDraftSource(source)) {
      await handleInitialSave({
        id: transform.id,
        source,
      });
    }
  };

  const handleCancel = () => {
    setSource(transform.source);
  };

  useLayoutEffect(() => {
    setSource(sourceRef.current);
    setUiControls(getInitialUiControls());
  }, [transform.id, sourceRef]);

  return (
    <>
      {source.type === "python" ? (
        <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
          id={transform.id}
          name={transform.name}
          source={source}
          proposedSource={
            proposedSource?.type === "python" ? proposedSource : undefined
          }
          isSaving={isSaving || isCheckingDependencies}
          isSourceDirty={isSourceDirty}
          onNameChange={handleNameChange}
          onSourceChange={setSource}
          onSave={handleSave}
          onCancel={handleCancel}
          onAcceptProposed={acceptProposed}
          onRejectProposed={rejectProposed}
        />
      ) : (
        <TransformEditor
          id={transform.id}
          name={transform.name}
          source={source}
          proposedSource={
            proposedSource?.type === "query" ? proposedSource : undefined
          }
          uiControls={uiControls}
          isSaving={isSaving || isCheckingDependencies}
          isSourceDirty={isSourceDirty}
          onNameChange={handleNameChange}
          onSourceChange={setSource}
          onUiControlsChange={setUiControls}
          onSave={handleSave}
          onCancel={handleCancel}
          onAcceptProposed={acceptProposed}
          onRejectProposed={rejectProposed}
        />
      )}
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCloseConfirmation}
        />
      )}
      <LeaveRouteConfirmModal route={route} isEnabled={isSourceDirty} />
    </>
  );
}
