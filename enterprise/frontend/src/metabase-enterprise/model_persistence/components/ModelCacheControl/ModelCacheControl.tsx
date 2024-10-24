import { t } from "ttag";

import {
  skipToken,
  useGetDatabaseQuery,
  usePersistModelMutation,
  useUnpersistModelMutation,
} from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Switch, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";
import type { ModelCacheRefreshStatus } from "metabase-types/api";

export function ModelCacheToggle({
  persistedModel,
  model,
}: {
  persistedModel?: ModelCacheRefreshStatus;
  model: Question;
}) {
  const [persistModel] = usePersistModelMutation();
  const [unpersistModel] = useUnpersistModelMutation();
  const {
    data: database,
    isLoading: isLoadingDb,
    error: dbError,
  } = useGetDatabaseQuery(
    model.databaseId() ? { id: model.databaseId() as number } : skipToken,
  );

  if (isLoadingDb || dbError) {
    return (
      <DelayedLoadingAndErrorWrapper loading={isLoadingDb} error={dbError} />
    );
  }

  const isPersisted = persistedModel && persistedModel.state !== "off";
  const modelId = model.id();
  const userCanPersist = model.canManageDB();
  const canPersistDatabase = database?.settings?.["persist-models-enabled"];

  if (!canPersistDatabase || !userCanPersist) {
    const tooltipLabel = !canPersistDatabase
      ? t`Model persistence is disabled for this database`
      : t`You don't have permission to modify model persistence`;

    return (
      <Tooltip label={tooltipLabel}>
        {/* need this div so that disabled input doesn't swallow pointer events */}
        <div>
          <Switch
            label={t`Persist model data`}
            size="sm"
            checked={isPersisted}
            disabled
          />
        </div>
      </Tooltip>
    );
  }

  const toggleModelPersistence = isPersisted
    ? () => unpersistModel(modelId)
    : () => persistModel(modelId);

  return (
    <Switch
      label={t`Persist model data`}
      size="sm"
      checked={isPersisted}
      onChange={toggleModelPersistence}
      disabled={false}
    />
  );
}
