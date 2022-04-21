import React, { useEffect } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";

import { State } from "metabase-types/store";
import PersistedModels from "metabase/entities/persisted-models";

import { ModelCacheRefreshStatus } from "metabase-types/api";

import { ErrorBox } from "./ModelCacheRefreshJobs.styled";

type ModelCacheRefreshJobModalOwnProps = {
  params: {
    jobId: string;
  };
  onClose: () => void;
};

type ModelCacheRefreshJobModalStateProps = {
  job?: ModelCacheRefreshStatus;
  onRefresh: (job: ModelCacheRefreshStatus) => void;
};

type ModelCacheRefreshJobModalProps = ModelCacheRefreshJobModalOwnProps &
  ModelCacheRefreshJobModalStateProps;

function mapStateToProps(
  state: State,
  props: ModelCacheRefreshJobModalOwnProps,
) {
  const { jobId } = props.params;
  return {
    job: PersistedModels.selectors.getObject(state, {
      entityId: Number(jobId),
    }),
  };
}

const mapDispatchToProps = {
  onRefresh: (job: ModelCacheRefreshStatus) =>
    PersistedModels.objectActions.refreshCache(job),
};

function ModelCacheRefreshJobModal({
  job,
  onClose,
  onRefresh,
}: ModelCacheRefreshJobModalProps) {
  useEffect(() => {
    if (job?.state === "persisted" && onClose) {
      onClose();
    }
  }, [job, onClose]);

  const onRefreshClick = () => {
    if (job) {
      onRefresh(job);
      onClose();
    }
  };

  return (
    <ModalContent
      title={t`Oh oh…`}
      onClose={onClose}
      footer={
        job
          ? [
              <Button
                key="retry"
                primary
                onClick={onRefreshClick}
              >{t`Retry now`}</Button>,
              <Link
                key="edit"
                className="Button"
                to={`/model/${job?.card_id}/query`}
              >{t`Edit model`}</Link>,
            ]
          : null
      }
    >
      {job?.error && <ErrorBox>{job.error}</ErrorBox>}
    </ModalContent>
  );
}

export default connect(
  mapStateToProps,
  mapDispatchToProps,
)(ModelCacheRefreshJobModal);
