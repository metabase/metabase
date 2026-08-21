import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { Stack } from "metabase/ui";

import S from "./BaseUpsellPage.module.css";

export type BaseUpsellPageProps = {
  campaign: string;
  location: string;
  title: string;
  description: string;
  bulletPoints?: string[];
  image?: string;
  variant?: "image-full-height" | "image-card";
};

// Follows the same shape as the data-studio and monitor upsell pages, with the
// card aligned to the page heading the hub renders above it.
export function BaseUpsellPage({
  campaign,
  location,
  title,
  description,
  bulletPoints,
  image,
  variant,
}: BaseUpsellPageProps) {
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location,
  });

  return (
    <DottedBackground px={0} py="2rem">
      <Stack align="flex-start" className={S.UpsellPageContent}>
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={location}
            title={title}
            description={description}
            bulletPoints={bulletPoints}
            image={image}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            variant={variant}
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
}
