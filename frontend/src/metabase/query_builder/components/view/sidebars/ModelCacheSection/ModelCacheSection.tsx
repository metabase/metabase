import React from "react";
import { t, jt } from "ttag";
import moment from "moment";
import { connect } from "react-redux";

import PersistedModels from "metabase/entities/persisted-models";

import Question from "metabase-lib/lib/Question";
import { ModelCacheRefreshStatus } from "metabase-types/api";

import {
  Row,
  StatusContainer,
  StatusLabel,
  LastRefreshTimeLabel,
  IconButton,
  ErrorIcon,
  RefreshIcon,
} from "./ModelCacheSection.styled";

type Props = {
  model: Question;
  onRefresh: (job: ModelCacheRefreshStatus) => void;
};

type LoaderRenderProps = {
  persistedModels: ModelCacheRefreshStatus[];
};

function getStatusMessage(job: ModelCacheRefreshStatus) {
  if (job.state === "error") {
    return t`Failed to update model cache`;
  }
  if (job.state === "refreshing") {
    return t`Refreshing model cache`;
  }
  const lastRefreshTime = moment(job.refresh_end).fromNow();
  return jt`Model last cached ${lastRefreshTime}`;
}

const mapDispatchToProps = {
  onRefresh: (job: ModelCacheRefreshStatus) =>
    PersistedModels.objectActions.refreshCache(job),
};

function ModelCacheSection({ model, onRefresh }: Props) {
  return (
    <PersistedModels.ListLoader
      query={{
        limit: 100,
        offset: 0,
      }}
    >
      {({ persistedModels }: LoaderRenderProps) => {
        const job = persistedModels.find(job => job.card_id === model.id());
        if (!job) {
          return null;
        }

        const isError = job.state === "error";
        const lastRefreshTime = moment(job.refresh_end).fromNow();

        return (
          <Row>
            <div>
              <StatusContainer>
                <StatusLabel>{getStatusMessage(job)}</StatusLabel>
                {isError && <ErrorIcon name="warning" size={14} />}
              </StatusContainer>
              {isError && (
                <LastRefreshTimeLabel>
                  {jt`Last attempt ${lastRefreshTime}`}
                </LastRefreshTimeLabel>
              )}
            </div>
            <IconButton onClick={() => onRefresh(job)}>
              <RefreshIcon name="refresh" tooltip={t`Refresh now`} size={14} />
            </IconButton>
          </Row>
        );
      }}
    </PersistedModels.ListLoader>
  );
}

export default connect(null, mapDispatchToProps)(ModelCacheSection);
