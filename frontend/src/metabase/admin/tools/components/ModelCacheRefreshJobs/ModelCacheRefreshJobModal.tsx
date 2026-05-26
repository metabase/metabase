import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetPersistedInfoQuery,
  useRefreshModelCacheMutation,
} from "metabase/api";
import { Button } from "metabase/common/components/Button";
import { Link } from "metabase/common/components/Link";
import { ModalContent } from "metabase/common/components/ModalContent";
import ButtonsS from "metabase/css/components/buttons.module.css";
import type { ModalComponentProps } from "metabase/hoc/ModalRoute";
import { parseNumberParam } from "metabase/urls";

import { ErrorBox } from "./ModelCacheRefreshJobs.styled";

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
        primary
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
      {persistedModel?.error && <ErrorBox>{persistedModel.error}</ErrorBox>}
    </ModalContent>
  );
}
