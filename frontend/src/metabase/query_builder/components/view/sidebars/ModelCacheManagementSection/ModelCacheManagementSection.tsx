import moment from "moment-timezone"; // eslint-disable-line no-restricted-imports -- deprecated usage
import { t } from "ttag";

import {
  useGetPersistedInfoByCardQuery,
  useRefreshModelCacheMutation,
} from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";
import type Question from "metabase-lib/v1/Question";
import { checkCanRefreshModelCache } from "metabase-lib/v1/metadata/utils/models";
import type { ModelCacheRefreshStatus } from "metabase-types/api";

import {
  ErrorIcon,
  IconButton,
  LastRefreshTimeLabel,
  RefreshIcon,
  Row,
  StatusContainer,
  StatusLabel,
} from "./ModelCacheManagementSection.styled";

type Props = {
  model: Question;
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

export function ModelCacheManagementSection({ model }: Props) {
  const { data: persistedModel, isLoading } = useGetPersistedInfoByCardQuery(
    model.id(),
  );
  const [onRefresh] = useRefreshModelCacheMutation();

  if (isLoading) {
    // we actually don't want to show the error here, because if the model has not been cached
    // the api returns a 404 instead of an empty record
    return <DelayedLoadingAndErrorWrapper loading error={null} />;
  }

  const shouldShowRefreshStatus =
    persistedModel &&
    persistedModel.state !== "off" &&
    persistedModel.state !== "deletable";

  const isError = persistedModel?.state === "error";
  const lastRefreshTime = moment(persistedModel?.refresh_end).fromNow();

  return (
    <>
      {
        <PLUGIN_MODEL_PERSISTENCE.ModelCacheToggle
          persistedModel={persistedModel}
          model={model}
        />
      }

      {shouldShowRefreshStatus && (
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
            <IconButton onClick={() => onRefresh(model.id())}>
              <RefreshIcon name="refresh" tooltip={t`Refresh now`} />
            </IconButton>
          )}
        </Row>
      )}
    </>
  );
}
