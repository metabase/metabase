import { t } from "ttag";

import { useUpgradeAction } from "metabase/admin/upsells/components/UpgradeModal";
import { DATA_STUDIO_UPGRADE_URL } from "metabase/admin/upsells/constants";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { UpsellCardContent } from "metabase/data-studio/upsells/components/UpsellCardContent";
import { useSelector } from "metabase/lib/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Stack } from "metabase/ui";

import { DottedBackground } from "../components/DottedBackground";
import { LineDecorator } from "../components/LineDecorator";

const CAMPAIGN = "remote-sync";
const LOCATION = "data-studio-remote-sync";

export function RemoteSyncUpsellPage() {
  const applicationName = useSelector(getApplicationName);
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: DATA_STUDIO_UPGRADE_URL,
    campaign: CAMPAIGN,
    location: LOCATION,
  });

  return (
    <DottedBackground px="3.5rem" pb="2rem">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Remote sync`}</DataStudioBreadcrumbs>
        }
      />
      <Stack align="center" p={40}>
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
    </DottedBackground>
  );
}
