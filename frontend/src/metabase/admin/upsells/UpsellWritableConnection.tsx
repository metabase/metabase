import { t } from "ttag";

import { UpsellBanner } from "metabase/common/components/upsells/components";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";

export const UpsellWritableConnection = ({
  location,
}: {
  location: string;
}) => {
  const campaign = "writable-connection";
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  const hasWritableConnection = useHasTokenFeature("writable_connection");

  if (hasWritableConnection) {
    return null;
  }

  return (
    <UpsellBanner
      campaign={campaign}
      buttonText={t`Try for free`}
      buttonLink={UPGRADE_URL}
      location={location}
      title={t`Use a separate write connection`}
      onClick={triggerUpsellFlow}
    >
      {t`Configure dedicated write credentials so actions and data uploads use a least-privilege connection that's isolated from your read traffic.`}
    </UpsellBanner>
  );
};
