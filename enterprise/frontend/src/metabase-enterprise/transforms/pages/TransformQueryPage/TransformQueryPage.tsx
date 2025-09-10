import { push } from "react-router-redux";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import {
  useGetTransformQuery,
  useUpdateTransformMutation,
} from "metabase-enterprise/api";
import type { DatasetQuery, Transform } from "metabase-types/api";

import { QueryEditor } from "../../components/QueryEditor";
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

  if (isLoading || error != null) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (transform == null) {
    return <LoadingAndErrorWrapper error={t`Transform not found.`} />;
  }

  return <TransformQueryPageBody transform={transform} />;
}

type TransformQueryPageBodyProps = {
  transform: Transform;
};

export function TransformQueryPageBody({
  transform,
}: TransformQueryPageBodyProps) {
  const [updateTransform, { isLoading }] = useUpdateTransformMutation();
  const dispatch = useDispatch();
  const { sendSuccessToast } = useMetadataToasts();

  const {
    checkData,
    isConfirmationShown,
    handleInitialSave,
    handleSaveAfterConfirmation,
    handleCancelSave,
  } = PLUGIN_DEPENDENCIES.useCheckTransformDependencies({
    onSave: async (patch) => {
      await updateTransform(patch).unwrap();
      sendSuccessToast(t`Transform query updated`);
      dispatch(push(getTransformUrl(transform.id)));
    },
  });

  const handleSaveQuery = async (query: DatasetQuery) => {
    await handleInitialSave({
      id: transform.id,
      source: { type: "query", query },
    });
  };

  const handleCancel = () => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  return (
    <>
      <QueryEditor
        initialQuery={transform.source.query}
        isNew={false}
        isSaving={isLoading}
        onSave={handleSaveQuery}
        onCancel={handleCancel}
      />
      {isConfirmationShown && checkData != null && (
        <PLUGIN_DEPENDENCIES.CheckDependenciesModal
          checkData={checkData}
          opened
          onSave={handleSaveAfterConfirmation}
          onClose={handleCancelSave}
        />
      )}
    </>
  );
}
