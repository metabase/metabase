import { useEffect, useMemo } from "react";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import { Button } from "metabase/common/components/Button";
import { Link } from "metabase/common/components/Link";
import { ModalContent } from "metabase/common/components/ModalContent";
import ButtonsS from "metabase/css/components/buttons.module.css";
import { PersistedModels } from "metabase/entities/persisted-models";
import { connect } from "metabase/lib/redux";
import type { ModelCacheRefreshStatus } from "metabase-types/api";

import { ErrorBox } from "./ModelCacheRefreshJobs.styled";

type ModelCacheRefreshJobModalOwnProps = {
  params: {
    jobId: string;
  };
  onClose: () => void;
};

type ModelCacheRefreshJobModalStateProps = {
  onRefresh: (job: ModelCacheRefreshStatus) => void;
};

type PersistedModelsLoaderProps = {
  persistedModel: ModelCacheRefreshStatus;
};

type ModelCacheRefreshJobModalProps = ModelCacheRefreshJobModalOwnProps &
  ModelCacheRefreshJobModalStateProps &
  PersistedModelsLoaderProps;

const mapDispatchToProps = {
  onRefresh: (job: ModelCacheRefreshStatus) =>
    PersistedModels.objectActions.refreshCache(job),
};

function ModelCacheRefreshJobModalInner({
  persistedModel,
  onClose,
  onRefresh,
}: ModelCacheRefreshJobModalProps) {
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

    const onRefreshClick = () => onRefresh(persistedModel);

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
  }, [persistedModel, onRefresh]);

  return (
    <ModalContent title={t`Oh oh…`} onClose={onClose} footer={footer}>
      {persistedModel?.error && <ErrorBox>{persistedModel.error}</ErrorBox>}
    </ModalContent>
  );
}

export const ModelCacheRefreshJobModal = _.compose(
  connect(null, mapDispatchToProps),
  PersistedModels.load({
    id: (state: unknown, props: ModelCacheRefreshJobModalOwnProps) =>
      props.params.jobId,
    loadingAndErrorWrapper: false,
  }),
)(ModelCacheRefreshJobModalInner);
