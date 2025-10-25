import { useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TransformEditor } from "../../components/TransformEditor";

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
  const [source, setSource] = useState(transform.source);
  const [updateTransform] = useUpdateTransformMutation();
  const { sendSuccessToast, sendErrorToast, sendUndoToast } =
    useMetadataToasts();

  const {
    checkData,
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
      }
    },
  });

  const handleNameChange = async (name: string) => {
    const { error } = await updateTransform({
      id: transform.id,
      name,
    });

    if (error) {
      sendErrorToast(t`Failed to update transform name`);
    } else {
      sendSuccessToast(t`Transform name updated`, async () => {
        const { error } = await updateTransform({
          id: transform.id,
          name: transform.name,
        });
        sendUndoToast(error);
      });
    }
  };

  const handleSave = async () => {
    await handleInitialSave({
      id: transform.id,
      source,
    });
  };

  return (
    <>
      <TransformEditor
        transform={transform}
        onNameChange={handleNameChange}
        onSourceChange={setSource}
        onSave={handleSave}
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
