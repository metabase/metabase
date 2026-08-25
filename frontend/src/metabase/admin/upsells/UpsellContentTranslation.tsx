import { t } from "ttag";

import { DottedBackground } from "metabase/common/components/upsells/components/DottedBackground";
import { LineDecorator } from "metabase/common/components/upsells/components/LineDecorator";
import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCardContent } from "metabase/common/components/upsells/components/UpsellCardContent";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Stack } from "metabase/ui";

/**
 * Content translation is the embedding hub's Localization tab in its entirety,
 * and it is paid, so below the paywall the tab would otherwise be blank.
 *
 * Showing an upsell keeps the hub's tab set the same seven on every edition.
 *
 * No Figma frame exists for this one yet, so both the copy and the
 * illustration are placeholders, flagged as such at their use sites.
 */
export const UpsellContentTranslation = ({ source }: { source: string }) => {
  const hasContentTranslation = useHasTokenFeature("content_translation");
  const campaign = "content-translation";

  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location: source,
  });

  if (hasContentTranslation) {
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
            title={t`Translate your embedded content`}
            description={t`Upload a dictionary so dashboard, question and column names appear in each viewer's own language.`}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            // A generated placeholder, sized to match the real upsell
            // illustrations, rather than another upsell's artwork -- borrowing
            // one makes a pending design look finished. Replace when the real
            // illustration is exported.
            image="app/assets/img/upsell-embedding-localization-placeholder.svg"
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
};
