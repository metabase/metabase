import { useEffect } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";

import {
  skipToken,
  useGetPersistedInfoQuery,
  useRefreshModelCacheMutation,
} from "metabase/api";
import { Link } from "metabase/common/components/Link";
import type { ModalComponentProps } from "metabase/common/components/ModalRoute";
import { Box, Button, Modal } from "metabase/ui";
import { parseNumberParam } from "metabase/urls";

import S from "./ModelPersistenceLogJobs.module.css";

export function ModelPersistenceLogJobModal({
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

  return (
    <Modal opened size="lg" title={t`Oh oh…`} onClose={onClose}>
      {persistedModel?.error && (
        <Box className={S.errorBox}>{persistedModel.error}</Box>
      )}
      {persistedModel && (
        <Modal.Footer>
          <Button
            component={Link}
            to={`/model/${persistedModel.card_id}/query`}
          >{t`Edit model`}</Button>
          <Button
            variant="filled"
            onClick={() => refreshModelCache(persistedModel.card_id)}
          >{t`Retry now`}</Button>
        </Modal.Footer>
      )}
    </Modal>
  );
}
