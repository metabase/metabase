import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import { getTransformUrl } from "metabase-enterprise/transforms/old/utils/urls";
import type { DatasetQuery, Transform } from "metabase-types/api";

import { QueryEditor } from "../../../../components/QueryEditor";

type TransformQuerySettingsProps = {
  transform: Transform;
};

export function TransformQuerySettings({
  transform,
}: TransformQuerySettingsProps) {
  const [updateTransform, { isLoading }] = useUpdateTransformMutation();
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleSave = async (query: DatasetQuery) => {
    const { error } = await updateTransform({
      id: transform.id,
      source: {
        type: "query",
        query,
      },
    });

    if (error) {
      sendErrorToast(t`Failed to update transform query`);
    } else {
      sendSuccessToast(t`Transform query updated`);
      dispatch(push(getTransformUrl(transform.id)));
    }
  };

  const handleCancel = () => {
    dispatch(push(getTransformUrl(transform.id)));
  };

  return (
    <QueryEditor
      name={transform.name}
      query={transform.source.query}
      isNew={false}
      isSaving={isLoading}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
