import { useEffect, useMemo } from "react";
import { connect } from "react-redux";
import { usePrevious } from "react-use";
import { t } from "ttag";
import _ from "underscore";

import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import ButtonsS from "metabase/css/components/buttons.module.css";
import PersistedModels from "metabase/entities/persisted-models";
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

function ModelCacheRefreshJobModal({
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default _.compose(
  connect(null, mapDispatchToProps),
  PersistedModels.load({
    id: (state: unknown, props: ModelCacheRefreshJobModalOwnProps) =>
      props.params.jobId,
    loadingAndErrorWrapper: false,
  }),
)(ModelCacheRefreshJobModal);
