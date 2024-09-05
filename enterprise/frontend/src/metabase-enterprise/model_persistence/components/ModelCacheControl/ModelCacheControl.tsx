import { t } from "ttag";

import {
  skipToken,
  useGetDatabaseQuery,
  usePersistModelMutation,
  useUnpersistModelMutation,
} from "metabase/api";
import { Switch } from "metabase/ui";
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
  const { data: database } = useGetDatabaseQuery(
    model.databaseId() ? { id: model.databaseId() as number } : skipToken,
  );

  const canPersist = database?.settings?.["persist-models-enabled"];

  const isPersisted = persistedModel && persistedModel.state !== "off";
  const modelId = model.id();

  const toggleModelPersistence = isPersisted
    ? () => unpersistModel(modelId)
    : () => persistModel(modelId);

  return (
    <Switch
      label={t`Persist model data`}
      error={
        !canPersist
          ? t`Model persistence is disabled for this database`
          : undefined
      }
      size="sm"
      checked={isPersisted}
      onChange={toggleModelPersistence}
      disabled={!canPersist}
    />
  );
}
