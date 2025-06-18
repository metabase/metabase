import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getIsHosted } from "metabase/setup/selectors";

import { UpsellBanner } from "./components";

export const UpsellEmailWhitelabelBanner = ({ source }: { source: string }) => {
  const isHosted = useSelector(getIsHosted);

  if (isHosted) {
    return null;
  }

  return (
    <UpsellBanner
      title={t`Whitelabel email notifications`}
      campaign="hosting"
      buttonText={t`Try for free`}
      internalLink="/admin/settings/cloud"
      source={source}
    >
      {t`Change the 'from' address for subscriptions and alerts so people know they're coming from your org.`}
    </UpsellBanner>
  );
};
