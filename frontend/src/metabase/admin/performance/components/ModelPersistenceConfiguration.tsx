/* eslint-disable ttag/no-module-declaration -- see metabase#55045 */
import type { ChangeEvent } from "react";
import { useEffect, useState } from "react";
import { c, msgid, ngettext, t } from "ttag";

import {
  SettingsPageWrapper,
  SettingsSection,
} from "metabase/admin/components/SettingsSection";
import { ModelCachingScheduleWidget } from "metabase/admin/settings/components/widgets/ModelCachingScheduleWidget/ModelCachingScheduleWidget";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useDocsUrl, useSetting, useToast } from "metabase/common/hooks";
import { useDispatch, useSelector } from "metabase/lib/redux";
import { refreshSiteSettings } from "metabase/redux/settings";
import {
  getApplicationName,
  getShowMetabaseLinks,
} from "metabase/selectors/whitelabel";
import { PersistedModelsApi } from "metabase/services";
import { Switch, Text } from "metabase/ui";

import ModelPersistenceConfigurationS from "./ModelPersistenceConfiguration.module.css";

const modelCachingOptions = [
  {
    value: "0 0 0/1 * * ? *",
    // this has to be plural because it's plural elsewhere and it cannot be both a singular message ID and a
    // plural message ID
    label: ngettext(msgid`Hour`, `Hours`, 1),
  },
  {
    value: "0 0 0/2 * * ? *",
    label: t`2 hours`,
  },
  {
    value: "0 0 0/3 * * ? *",
    label: t`3 hours`,
  },
  {
    value: "0 0 0/6 * * ? *",
    label: t`6 hours`,
  },
  {
    value: "0 0 0/12 * * ? *",
    label: t`12 hours`,
  },
  {
    value: "0 0 0 ? * * *",
    label: t`24 hours`,
  },
  {
    value: "custom",
    label: t`Custom…`,
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

  const dispatch = useDispatch();
  const [sendToast, removeToast] = useToast();

  const showLoadingToast = async () => {
    const result = await sendToast({
      icon: "info",
      message: t`Loading...`,
    });
    return result?.payload?.id as number;
  };

  const resolveWithToasts = async (promises: Promise<any>[]) => {
    let loadingToastId;
    try {
      loadingToastId = await showLoadingToast();
      await Promise.all(promises);
      sendToast({ message: "Saved" });
    } catch (e) {
      sendToast({
        icon: "warning",
        toastColor: "error",
        message: t`An error occurred`,
      });
    } finally {
      if (loadingToastId !== undefined) {
        removeToast(loadingToastId);
      }
    }
  };

  const applicationName = useSelector(getApplicationName);

  const onSwitchChanged = async (e: ChangeEvent<HTMLInputElement>) => {
    const shouldEnable = e.target.checked;
    setModelPersistenceEnabled(shouldEnable);
    const promise = shouldEnable
      ? PersistedModelsApi.enablePersistence()
      : PersistedModelsApi.disablePersistence();
    await resolveWithToasts([promise]);
    dispatch(refreshSiteSettings());
  };

  const { url: docsUrl } = useDocsUrl("data-modeling/model-persistence");

  return (
    <SettingsPageWrapper
      title={t`Model persistence`}
      description={t`Enable model persistence to make your models (and the queries that use them) load faster.`}
    >
      <SettingsSection
        className={ModelPersistenceConfigurationS.Explanation}
        maw="40rem"
      >
        <Text>
          {c(
            '{0} is either "Metabase" or the customized name of the application.',
          )
            .t`This will create a table for each of your models in a dedicated schema. ${applicationName} will refresh them on a schedule. Questions and queries that use your models will query these tables.`}
          {showMetabaseLinks && (
            <>
              {" "}
              <ExternalLink
                key="model-caching-link"
                href={docsUrl}
              >{t`Learn more`}</ExternalLink>
            </>
          )}
        </Text>
        <DelayedLoadingAndErrorWrapper
          error={null}
          loading={modelPersistenceEnabled === undefined}
        >
          <Switch
            label={
              <Text fw="bold">
                {modelPersistenceEnabled ? t`Enabled` : t`Disabled`}
              </Text>
            }
            onChange={onSwitchChanged}
            checked={modelPersistenceEnabled}
          />
        </DelayedLoadingAndErrorWrapper>

        {/* modelCachingSchedule is sometimes undefined but TS thinks it is always a string */}
        {modelPersistenceEnabled && modelCachingSchedule && (
          <div>
            <ModelCachingScheduleWidget
              value={modelCachingSchedule}
              options={modelCachingOptions}
              onChange={async (value: unknown) => {
                await resolveWithToasts([
                  PersistedModelsApi.setRefreshSchedule({ cron: value }),
                  dispatch(refreshSiteSettings()),
                ]);
              }}
            />
          </div>
        )}
      </SettingsSection>
    </SettingsPageWrapper>
  );
};
