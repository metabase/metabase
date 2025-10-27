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
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { DraftTransformSource, Transform } from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";
import { isNotDraftSource, isSameSource } from "../../utils";

type TransformQueryPageParams = {
  transformId: string;
};

type TransformQueryPageProps = {
  route: Route;
  params: TransformQueryPageParams;
};

export function TransformQueryPage({ route, params }: TransformQueryPageProps) {
  const transformId = Urls.extractEntityId(params.transformId);
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken);

  if (isLoading || error || transform == null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
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
  const sourceRef = useLatest(transform.source);
  const [updateName] = useUpdateTransformMutation();
  const [updateSource, { isLoading: isSaving }] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

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
  }, [transform.id, sourceRef]);

  return (
    <>
      {source.type === "python" ? (
        <PLUGIN_TRANSFORMS_PYTHON.TransformEditor
          id={transform.id}
          name={transform.name}
          source={source}
          isSaving={isSaving || isCheckingDependencies}
          isSourceDirty={isSourceDirty}
          onNameChange={handleNameChange}
          onSourceChange={setSource}
          onSave={handleSave}
          onCancel={handleCancel}
        />
      ) : (
        <TransformEditor
          id={transform.id}
          name={transform.name}
          source={source}
          isSaving={isSaving || isCheckingDependencies}
          isSourceDirty={isSourceDirty}
          onNameChange={handleNameChange}
          onSourceChange={setSource}
          onSave={handleSave}
          onCancel={handleCancel}
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
