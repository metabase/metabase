import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TransformQueryBuilder } from "../../../components/TransformQueryBuilder";
import { useQueryMetadata } from "../../../hooks/use-query-metadata";
import { transformUrl } from "../../../utils/urls";

type TransformQuerySettingsProps = {
  transform: Transform;
};

export function TransformQuerySettings({
  transform,
}: TransformQuerySettingsProps) {
  const [query, setQuery] = useState(transform.source.query);
  const { isLoaded } = useQueryMetadata(query);
  const [updateTransform, { isLoading }] = useUpdateTransformMutation();
  const dispatch = useDispatch();
  const { sendErrorToast, sendSuccessToast } = useMetadataToasts();

  const handleSave = async () => {
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
      dispatch(push(transformUrl(transform.id)));
    }
  };

  const handleCancel = () => {
    dispatch(push(transformUrl(transform.id)));
  };

  if (!isLoaded) {
    return <LoadingAndErrorWrapper loading />;
  }

  return (
    <TransformQueryBuilder
      query={query}
      isSaving={isLoading}
      onChange={setQuery}
      onSave={handleSave}
      onCancel={handleCancel}
    />
  );
}
