import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { Stack } from "metabase/ui";

export function MetabotUpsellPage({
  campaign,
  location,
  title,
  description,
  image,
}: {
  campaign: string;
  location: string;
  title: string;
  description: string;
  image: string;
}) {
  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location,
  });

  return (
    <DottedBackground p="4rem">
      <Stack align="center" p={40}>
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={location}
            title={title}
            description={description}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            image={image}
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
}
