import { t } from "ttag";

import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Stack } from "metabase/ui";

const CAMPAIGN = "remote-sync";
const LOCATION = "content-studio";

export function ContentStudioUpsellPage() {
  const applicationName = useSelector(getApplicationName);
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign: CAMPAIGN,
    location: LOCATION,
  });

  return (
    <Stack align="center" py="xl">
      <LineDecorator>
        <UpsellCardContent
          campaign={CAMPAIGN}
          location={LOCATION}
          title={t`Manage your ${applicationName} content in Git`}
          description={t`Keep your most important datasets, metrics, and SQL logic under version control. Sync content to a Git repository to review changes, collaborate, and maintain a production-ready source of truth.`}
          image="app/assets/img/data-studio-remote-sync-upsell.svg"
          upgradeOnClick={upgradeOnClick}
          upgradeUrl={upgradeUrl}
          variant="image-full-height"
        />
      </LineDecorator>
    </Stack>
  );
}
