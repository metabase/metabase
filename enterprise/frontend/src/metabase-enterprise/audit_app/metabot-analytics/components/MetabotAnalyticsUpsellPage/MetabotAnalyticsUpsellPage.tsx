import { t } from "ttag";

import { MetabotAdminLayout } from "metabase/admin/ai/MetabotAdminLayout";
import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { Stack } from "metabase/ui";

export function MetabotAnalyticsUpsellPage() {
  const campaign = "ai-controls-usage-auditing";
  const location = "ai-controls-usage-auditing-page";

  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location,
  });

  return (
    <MetabotAdminLayout
      fullWidth
      innerContentProps={{ fullWidth: true, fullHeight: true }}
    >
      <DottedBackground p="4rem">
        <Stack align="center" p={40}>
          <LineDecorator>
            <UpsellCardContent
              campaign={campaign}
              location={location}
              title={t`See how your team is using AI`}
              // eslint-disable-next-line metabase/no-literal-metabase-strings -- This string only shows for admins.
              description={t`Track trends of token use, conversations, and messages, and understand what your team is doing with AI in Metabase.`}
              upgradeOnClick={upgradeOnClick}
              upgradeUrl={upgradeUrl}
              image="app/assets/img/upsell-ai-usage-auditing.png"
            />
          </LineDecorator>
        </Stack>
      </DottedBackground>
    </MetabotAdminLayout>
  );
}
