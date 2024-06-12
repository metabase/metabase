import type { ChangeEventHandler } from "react";
import { useCallback, useEffect, useState } from "react";
import { c, t } from "ttag";

import { ModelCachingScheduleWidget } from "metabase/admin/settings/components/widgets/ModelCachingScheduleWidget/ModelCachingScheduleWidget";
import { useSetting } from "metabase/common/hooks";
import { DelayedLoadingAndErrorWrapper } from "metabase/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useDispatch, useSelector } from "metabase/lib/redux";
import MetabaseSettings from "metabase/lib/settings";
import { refreshSiteSettings } from "metabase/redux/settings";
import { addUndo, dismissUndo } from "metabase/redux/undo";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import { PersistedModelsApi } from "metabase/services";
import { Stack, Switch, Text } from "metabase/ui";

const modelCachingOptions = [
  {
    value: "0 0 0/1 * * ? *",
    name: t`Hour`,
  },
  {
    value: "0 0 0/2 * * ? *",
    name: t`2 hours`,
  },
  {
    value: "0 0 0/3 * * ? *",
    name: t`3 hours`,
  },
  {
    value: "0 0 0/6 * * ? *",
    name: t`6 hours`,
  },
  {
    value: "0 0 0/12 * * ? *",
    name: t`12 hours`,
  },
  {
    value: "0 0 0 ? * * *",
    name: t`24 hours`,
  },
  {
    value: "custom",
    name: t`Custom…`,
  },
];

export const ModelPersistenceConfiguration = () => {
  const showMetabaseLinks = useSelector(getShowMetabaseLinks);

  const modelPersistenceEnabledInAPI = useSetting("persisted-models-enabled");

  const [modelPersistenceEnabled, setModelPersistenceEnabled] = useState(false);
  useEffect(() => {
    setModelPersistenceEnabled(modelPersistenceEnabledInAPI);
  }, [modelPersistenceEnabledInAPI]);

  const modelCachingSchedule = useSetting(
    "persisted-model-refresh-cron-schedule",
  );

  const modelCachingSetting = {
    value: modelCachingSchedule,
    options: modelCachingOptions,
  };
  const dispatch = useDispatch();

  const showLoadingToast = useCallback(async () => {
    const result = await dispatch(
      addUndo({
        icon: "info",
        message: t`Loading...`,
      }),
    );
    return result?.payload?.id as number;
  }, [dispatch]);

  const dismissLoadingToast = useCallback(
    (toastId: number) => {
      dispatch(dismissUndo(toastId));
    },
    [dispatch],
  );

  const showErrorToast = useCallback(() => {
    dispatch(
      addUndo({
        icon: "warning",
        toastColor: "error",
        message: t`An error occurred`,
      }),
    );
  }, [dispatch]);

  const showSuccessToast = useCallback(() => {
    dispatch(addUndo({ message: "Saved" }));
  }, [dispatch]);

  const resolveWithToasts = useCallback(
    async (promises: Promise<any>[]) => {
      let loadingToastId;
      try {
        loadingToastId = await showLoadingToast();
        await Promise.all(promises);
        showSuccessToast();
      } catch (e) {
        showErrorToast();
      } finally {
        if (loadingToastId !== undefined) {
          dismissLoadingToast(loadingToastId);
        }
      }
    },
    [showLoadingToast, showSuccessToast, showErrorToast, dismissLoadingToast],
  );

  const applicationName = useSelector(getApplicationName);

  const onSwitchChanged = useCallback<ChangeEventHandler<HTMLInputElement>>(
    async e => {
      const shouldEnable = e.target.checked;
      setModelPersistenceEnabled(shouldEnable);
      const promise = shouldEnable
        ? PersistedModelsApi.enablePersistence()
        : PersistedModelsApi.disablePersistence();
      await resolveWithToasts([promise]);
      dispatch(refreshSiteSettings({}));
    },
    [resolveWithToasts, setModelPersistenceEnabled, dispatch],
  );

  return (
    <Stack spacing="xl" maw="40rem">
      <div>
        <p>
          {t`Enable model persistence to make your models (and the queries that use them) load faster.`}
        </p>
        <p>
          {c(
            '{0} is either "Metabase" or the customized name of the application.',
          )
            .t`This will create a table for each of your models in a dedicated schema. ${applicationName} will refresh them on a schedule. Questions and queries that use your models will query these tables.`}
          {showMetabaseLinks && (
            <>
              {" "}
              <ExternalLink
                key="model-caching-link"
                href={MetabaseSettings.docsUrl(
                  "data-modeling/model-persistence",
                )}
              >{t`Learn more`}</ExternalLink>
            </>
          )}
        </p>
        <DelayedLoadingAndErrorWrapper
          error={null}
          loading={modelPersistenceEnabled === undefined}
        >
          <Switch
            mt="sm"
            label={
              <Text fw="bold">
                {modelPersistenceEnabled ? t`Enabled` : t`Disabled`}
              </Text>
            }
            onChange={onSwitchChanged}
            checked={modelPersistenceEnabled}
          />
        </DelayedLoadingAndErrorWrapper>
      </div>
      {modelPersistenceEnabled && (
        <div>
          <ModelCachingScheduleWidget
            setting={modelCachingSetting}
            onChange={async value => {
              await resolveWithToasts([
                PersistedModelsApi.setRefreshSchedule({ cron: value }),
                dispatch(refreshSiteSettings({})),
              ]);
            }}
          />
        </div>
      )}
    </Stack>
  );
};
