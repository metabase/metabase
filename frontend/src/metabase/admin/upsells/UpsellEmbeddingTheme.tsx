import { t } from "ttag";

import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Stack } from "metabase/ui";

export const UpsellEmbeddingTheme = ({ source }: { source: string }) => {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const campaign = "embedding-themes";

  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location: source,
  });

  if (hasSimpleEmbedding) {
    return null;
  }

  return (
    <DottedBackground px={0} py="2rem">
      {/* Left-aligned, no extra horizontal padding: the card lines up
          with the page heading, as the design shows. */}
      <Stack align="flex-start">
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={source}
            title={t`Create custom themes`}
            description={t`Fine-tune the appearance of your embedded content with colors and fonts.`}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            image="app/assets/img/upsell-themes.png"
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
};
