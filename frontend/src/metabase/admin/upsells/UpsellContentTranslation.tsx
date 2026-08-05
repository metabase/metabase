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
 * No Figma frame exists for this one yet, so the copy and image follow the
 * shipped upsell pattern and are expected to be revised.
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
    <DottedBackground px="3.5rem" pb="2rem">
      <Stack align="center" p={40}>
        <LineDecorator>
          <UpsellCardContent
            campaign={campaign}
            location={source}
            title={t`Translate your embedded content`}
            description={t`Upload a dictionary so dashboard, question and column names appear in each viewer's own language.`}
            upgradeOnClick={upgradeOnClick}
            upgradeUrl={upgradeUrl}
            image="app/assets/img/upsell-themes.png"
          />
        </LineDecorator>
      </Stack>
    </DottedBackground>
  );
};
