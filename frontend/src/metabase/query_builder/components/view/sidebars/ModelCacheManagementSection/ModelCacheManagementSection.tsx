import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { connect } from "react-redux";
import { t } from "ttag";

import PersistedModels from "metabase/entities/persisted-models";
import type Question from "metabase-lib/v1/Question";
import { checkCanRefreshModelCache } from "metabase-lib/v1/metadata/utils/models";
import type { ModelCacheRefreshStatus } from "metabase-types/api";

import {
  Row,
  StatusContainer,
  StatusLabel,
  LastRefreshTimeLabel,
  IconButton,
  ErrorIcon,
  RefreshIcon,
} from "./ModelCacheManagementSection.styled";

type Props = {
  model: Question;
  onRefresh: (job: ModelCacheRefreshStatus) => void;
};

type LoaderRenderProps = {
  persistedModel: ModelCacheRefreshStatus;
};

function getStatusMessage(job: ModelCacheRefreshStatus) {
  if (job.state === "error") {
    return t`Failed to update model cache`;
  }
  if (job.state === "creating") {
    return t`Waiting to create the first model cache`;
  }
  if (job.state === "refreshing") {
    return t`Refreshing model cache`;
  }
  const lastRefreshTime = moment(job.refresh_end).fromNow();
  return t`Model last cached ${lastRefreshTime}`;
}

const mapDispatchToProps = {
  onRefresh: (job: ModelCacheRefreshStatus) =>
    PersistedModels.objectActions.refreshCache(job),
};

function ModelCacheManagementSection({ model, onRefresh }: Props) {
  return (
    <PersistedModels.Loader
      id={model.id()}
      entityQuery={{ type: "byModelId" }}
      selectorName="getByModelId"
      loadingAndErrorWrapper={false}
    >
      {({ persistedModel }: LoaderRenderProps) => {
        if (
          !persistedModel ||
          persistedModel.state === "off" ||
          persistedModel.state === "deletable"
        ) {
          return null;
        }

        const isError = persistedModel.state === "error";
        const lastRefreshTime = moment(persistedModel.refresh_end).fromNow();

        return (
          <Row data-testid="model-cache-section">
            <div>
              <StatusContainer>
                <StatusLabel>{getStatusMessage(persistedModel)}</StatusLabel>
                {isError && <ErrorIcon name="warning" />}
              </StatusContainer>
              {isError && (
                <LastRefreshTimeLabel>
                  {t`Last attempt ${lastRefreshTime}`}
                </LastRefreshTimeLabel>
              )}
            </div>
            {checkCanRefreshModelCache(persistedModel) && (
              <IconButton onClick={() => onRefresh(persistedModel)}>
                <RefreshIcon name="refresh" tooltip={t`Refresh now`} />
              </IconButton>
            )}
          </Row>
        );
      }}
    </PersistedModels.Loader>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default connect(null, mapDispatchToProps)(ModelCacheManagementSection);
