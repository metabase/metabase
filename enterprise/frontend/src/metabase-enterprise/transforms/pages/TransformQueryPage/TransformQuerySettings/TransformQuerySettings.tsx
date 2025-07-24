import { useState } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import { useDispatch } from "metabase/lib/redux";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { Box } from "metabase/ui";
import { useUpdateTransformMutation } from "metabase-enterprise/api";
import type { Transform } from "metabase-types/api";

import { TransformHeader } from "../../../components/TransformHeader";
import { TransformQueryBuilder } from "../../../components/TransformQueryBuilder";
import { transformUrl } from "../../../utils/urls";

type TransformQuerySettingsProps = {
  transform: Transform;
};

export function TransformQuerySettings({
  transform,
}: TransformQuerySettingsProps) {
  const [query, setQuery] = useState(transform.source.query);
  const [updateTransform] = useUpdateTransformMutation();
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

  return (
    <Box flex="1 1 0" bg="bg-white">
      <TransformHeader onSave={handleSave} onCancel={handleCancel} />
      <TransformQueryBuilder query={query} onChange={setQuery} />
    </Box>
  );
}
