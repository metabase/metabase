import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getIsHosted } from "metabase/setup/selectors";

import { UpsellBanner } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellEmailWhitelabelBanner = ({ source }: { source: string }) => {
  const isHosted = useSelector(getIsHosted);
  const hasCloudSMTPFeature = useHasTokenFeature("cloud-custom-smtp");

  if (!isHosted || hasCloudSMTPFeature) {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Whitelabel email notifications`}
      campaign="smtp-whitelabeling"
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      source={source}
    >
      {t`Change the 'from' address for subscriptions and alerts so people know they're coming from your org.`}
    </UpsellBanner>
  );
};
