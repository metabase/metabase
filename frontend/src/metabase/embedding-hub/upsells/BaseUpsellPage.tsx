import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { Box, Stack, Title } from "metabase/ui";

import S from "./BaseUpsellPage.module.css";

export type BaseUpsellPageProps = {
  campaign: string;
  location: string;
  header: string;
  title: string;
  description: string;
  bulletPoints?: string[];
  image?: string;
  variant?: "image-full-height" | "image-card";
};

// Same full-bleed shape as the data-studio and monitor upsell pages: the
// dotted field owns the whole tab, header included, instead of sitting
// inside the tab's normal 800px column below a separately-rendered title.
export function BaseUpsellPage({
  campaign,
  location,
  header,
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
    <DottedBackground px="3.5rem" pt="1.5rem" pb="2rem">
      {/* fit-content + mx="auto" so the title's box is exactly as wide as
          the card below it (Stack's default stretch), whatever that width
          is -- centering the pair without hardcoding the card's width. */}
      <Box w="fit-content" mx="auto">
        <Stack gap={160} p={40} className={S.UpsellPageContent}>
          <Title order={1}>{header}</Title>
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
      </Box>
    </DottedBackground>
  );
}
