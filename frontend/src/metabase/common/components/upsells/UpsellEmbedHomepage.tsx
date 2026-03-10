import { t } from "ttag";

import { Text } from "metabase/ui";

import { UpsellCard } from "./UpsellCard";
import { UPGRADE_URL } from "./constants";

const campaign = "advanced-embeds";

export const UpsellEmbedHomepage = ({ location }: { location: string }) => {
  return (
    <UpsellCard
      title={t`More advanced embeds`}
      campaign={campaign}
      // eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Pro, only visible to admins
      buttonText={t`Try Metabase Pro`}
      buttonLink={UPGRADE_URL}
      location={location}
      style={{
        minWidth: "13.5rem",
        backgroundColor: "transparent",
      }}
    >
      <Text size="sm" lh="md" ta="center">
        {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- Upsell for Metabase Pro, only visible to admins */}
        {t`Give your customers the full power of Metabase in your own app, with SSO, advanced permissions, customization, and more.`}
      </Text>
    </UpsellCard>
  );
};
