import dayjs from "dayjs";
import { t } from "ttag";

import {
  useGetPersistedInfoByCardQuery,
  useRefreshModelCacheMutation,
} from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";
import { Box, Button, Flex, Icon } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import { checkCanRefreshModelCache } from "metabase-lib/v1/metadata/utils/models";
import type { ModelCacheRefreshStatus } from "metabase-types/api";

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
  const lastRefreshTime = dayjs(job.refresh_end).fromNow();
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
  const lastRefreshTime = dayjs(persistedModel?.refresh_end).fromNow();

  const canRefreshCache =
    persistedModel && checkCanRefreshModelCache(persistedModel);

  const refreshButtonLabel =
    persistedModel?.state === "creating" ? (
      t`Create now`
    ) : (
      <Icon name="refresh" tooltip={t`Refresh now`} />
    );

  const canManageDB = model.canManageDB();

  const statusMessage = persistedModel ? getStatusMessage(persistedModel) : "";
  const lastRefreshLabel = t`Last attempt ${lastRefreshTime}`;

  return (
    <>
      {
        <PLUGIN_MODEL_PERSISTENCE.ModelCacheToggle
          persistedModel={persistedModel}
          model={model}
        />
      }

      {shouldShowRefreshStatus && (
        <Flex
          justify="space-between"
          align="center"
          data-testid="model-cache-section"
          c={canManageDB ? "text-primary" : "text-tertiary"}
          fz="md"
        >
          <Box>
            <Flex align="center" fw="bold" gap="sm">
              {statusMessage}
              {isError && <Icon name="warning" c="error" ml="sm" />}
            </Flex>
            {isError && <Box pt="sm">{lastRefreshLabel}</Box>}
          </Box>
          {canRefreshCache && canManageDB && (
            <Button
              variant="subtle"
              p="xs"
              c="text-primary"
              size="xs"
              onClick={() => onRefresh(model.id())}
            >
              {refreshButtonLabel}
            </Button>
          )}
        </Flex>
      )}
    </>
  );
}
