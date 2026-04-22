import { t } from "ttag";

import { useAdminSetting } from "metabase/api/utils";
import { UpsellBanner } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { Switch, Text } from "metabase/ui";

const settingName = "custom-viz-enabled";

export const UpsellCustomViz = ({ location }: { location: string }) => {
  const hasCustomVizAvailable = useHasTokenFeature("custom-viz-available");
  const {
    value: settingValue,
    updateSetting,
    settingDetails,
  } = useAdminSetting(settingName);
  const campaign = "custom-viz";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  if (hasCustomVizAvailable) {
    return null;
  }

  if (settingDetails?.is_env_setting) {
    return (
      <UpsellBanner
        title={t`Build your own visualizations`}
        campaign={campaign}
        buttonText={t`Try for free`}
        buttonLink={UPGRADE_URL}
        location={location}
        onClick={triggerUpsellFlow}
      >
        <Text>{t`Create custom chart types tailored to your data using the Custom visualizations SDK.`}</Text>
        <Text c="text-secondary">{t`Custom visualizations are set via environment variable.`}</Text>
      </UpsellBanner>
    );
  }

  const isEnabled = Boolean(settingValue);

  return (
    <UpsellBanner
      title={t`Build your own visualizations`}
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      onClick={triggerUpsellFlow}
    >
      <Text>{t`Create custom chart types tailored to your data using the Custom visualizations SDK.`}</Text>
      <Switch
        mt="sm"
        size="sm"
        label={t`Enable custom visualizations`}
        description={t`Allow custom visualizations to be used in this instance.`}
        labelPosition="left"
        checked={isEnabled}
        onChange={(event) =>
          updateSetting({
            key: settingName,
            value: event.currentTarget.checked,
          })
        }
      />
    </UpsellBanner>
  );
};
