import { useLayoutEffect, useMemo, useState } from "react";
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
import * as Lib from "metabase-lib";
import type { Transform, TransformSource } from "metabase-types/api";

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
    await handleInitialSave({
      id: transform.id,
      source,
    });
  };

  useLayoutEffect(() => {
    setSource(transform.source);
  }, [transform.source]);

  return (
    <>
      {source.type === "query" && (
        <TransformEditor
          id={transform.id}
          name={transform.name}
          source={source}
          isSaving={isSaving || isCheckingDependencies}
          isSourceDirty={isSourceDirty}
          onNameChange={handleNameChange}
          onSourceChange={setSource}
          onSave={handleSave}
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
    </>
  );
}

function isSameSource(source1: TransformSource, source2: TransformSource) {
  if (source1.type === "query" && source2.type === "query") {
    return Lib.areLegacyQueriesEqual(source1.query, source2.query);
  }
  return false;
}
