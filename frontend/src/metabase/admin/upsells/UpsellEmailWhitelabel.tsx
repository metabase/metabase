import { t } from "ttag";

import { useHasTokenFeature } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getIsHosted } from "metabase/setup/selectors";

import { UpsellPill } from "./components";
import { UPGRADE_URL } from "./constants";

export const UpsellEmailWhitelabelPill = ({ source }: { source: string }) => {
  const isHosted = useSelector(getIsHosted);
  const hasCloudSMTPFeature = useHasTokenFeature("cloud_custom_smtp");

  if (!isHosted || hasCloudSMTPFeature) {
    return null;
  }

  return (
    <UpsellPill
      campaign="smtp-whitelabeling"
      link={UPGRADE_URL}
      source={source}
    >
      {t`Whitelabel email notifications`}
    </UpsellPill>
  );
};
