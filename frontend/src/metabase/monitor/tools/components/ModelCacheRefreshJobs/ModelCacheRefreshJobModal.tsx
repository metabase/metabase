import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetPersistedInfoQuery,
  useRefreshModelCacheMutation,
} from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { ModalContent } from "metabase/common/components/ModalContent";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import ButtonsS from "metabase/css/components/buttons.module.css";
import { Box, Button } from "metabase/ui";
import { parseNumberParam } from "metabase/urls";

import S from "./ModelCacheRefreshJobs.module.css";

export function ModelCacheRefreshJobModal({
  params,
  onClose,
}: ModalComponentProps) {
  const jobId = parseNumberParam(params.jobId);
  const { data: persistedModel } = useGetPersistedInfoQuery(
    jobId !== undefined ? jobId : skipToken,
  );
  const [refreshModelCache] = useRefreshModelCacheMutation();
  const prevModelInfo = usePrevious(persistedModel);

  useEffect(() => {
    if (
      !prevModelInfo &&
      persistedModel &&
      persistedModel.state !== "error" &&
      onClose
    ) {
      onClose();
    }
  }, [prevModelInfo, persistedModel, onClose]);

  const footer = useMemo(() => {
    if (!persistedModel) {
      return null;
    }

    const onRefreshClick = () => refreshModelCache(persistedModel.card_id);

    return [
      <Button
        key="retry"
        variant="filled"
        onClick={onRefreshClick}
      >{t`Retry now`}</Button>,
      <Link
        key="edit"
        className={ButtonsS.Button}
        to={`/model/${persistedModel.card_id}/query`}
      >{t`Edit model`}</Link>,
    ];
  }, [persistedModel, refreshModelCache]);

  return (
    <ModalContent title={t`Oh oh…`} onClose={onClose} footer={footer}>
      {persistedModel?.error && (
        <Box className={S.errorBox}>{persistedModel.error}</Box>
      )}
    </ModalContent>
  );
}
