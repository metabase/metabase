import React, { useEffect } from "react";
import { t } from "ttag";
import { connect } from "react-redux";

import Button from "metabase/core/components/Button";
import Link from "metabase/core/components/Link";
import ModalContent from "metabase/components/ModalContent";

import { State } from "metabase-types/store";
import PersistedModels from "metabase/entities/persisted-models";

import { ModelCacheRefreshJob } from "./types";
import { ErrorBox } from "./ModelCacheRefreshJobs.styled";

type ModelCacheRefreshJobModalOwnProps = {
  params: {
    jobId: string;
  };
  onClose: () => void;
};

type ModelCacheRefreshJobModalStateProps = {
  job?: ModelCacheRefreshJob;
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

function ModelCacheRefreshJobModal({
  job,
  onClose,
}: ModelCacheRefreshJobModalProps) {
  useEffect(() => {
    if (job?.state === "persisted" && onClose) {
      onClose();
    }
  }, [job, onClose]);

  return (
    <ModalContent
      title={t`Oh oh…`}
      onClose={onClose}
      footer={
        job
          ? [
              <Button key="retry" primary>{t`Retry now`}</Button>,
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

export default connect(mapStateToProps)(ModelCacheRefreshJobModal);
