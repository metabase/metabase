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
  const { data: database, isLoading: isLoadingDb } = useGetDatabaseQuery(
    model.databaseId() ? { id: model.databaseId() as number } : skipToken,
  );

  if (isLoadingDb) {
    return <DelayedLoadingAndErrorWrapper loading error={null} />;
  }

  const isPersisted = persistedModel && persistedModel.state !== "off";
  const modelId = model.id();
  const canPersist = database?.settings?.["persist-models-enabled"];

  if (!canPersist) {
    return (
      <Tooltip label={t`Model persistence is disabled for this database`}>
        <div>
          {" "}
          {/* need this element so that disabled input doesn't swallow pointer events */}
          <Switch
            label={t`Persist model data`}
            size="sm"
            checked={false}
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
      disabled={!canPersist}
    />
  );
}
