import { useMount } from "react-use";
import { t } from "ttag";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UpsellGem } from "metabase/common/components/upsells/components";
import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "metabase/common/components/upsells/components/analytics";
import { PLUGIN_ADMIN_SETTINGS } from "metabase/plugins";
import { useSelector } from "metabase/redux";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { Button, Card, Group, Text } from "metabase/ui";

type UpsellProBannerProps = {
  /** The one line beside the button -- each surface names what it unlocks. */
  title: string;
  /** Where the banner sits, for attribution. */
  location: string;
};

/**
 * The hub's paywall banner: a gem, one line, and a Try Metabase Pro button.
 *
 * Not `UpsellBanner`: its CTA is a 12px chip with 4px of padding, and the
 * `large` variant that sizes it like a button also left-aligns the row and
 * grows the gem. This uses the plain `Button`, which is what the design shows.
 * The upsell analytics are the same events `UpsellBanner` sends.
 */
export function UpsellProBanner({ title, location }: UpsellProBannerProps) {
  const campaign = "embedding-hub";

  const upgradeUrl = useSelector((state) =>
    getUpgradeUrl(state, { utm_campaign: campaign, utm_content: location }),
  );
  const { triggerUpsellFlow } = PLUGIN_ADMIN_SETTINGS.useUpsellFlow({
    campaign,
    location,
  });

  useMount(() => trackUpsellViewed({ location, campaign }));

  // Hosted instances run the upgrade in a modal rather than navigating, so the
  // button is only a link when no flow is registered.
  const linkProps = triggerUpsellFlow
    ? {}
    : { component: ExternalLink, href: upgradeUrl };

  return (
    <Card p="md" withBorder>
      <Group justify="space-between" gap="md" wrap="nowrap">
        <Group gap="sm" wrap="nowrap">
          <UpsellGem />
          <Text c="text-primary">{title}</Text>
        </Group>

        <Button
          {...linkProps}
          variant="filled"
          // The button pins itself to 14px; the design's label is 12px.
          fz="sm"
          // Tracking goes on the capture phase because ExternalLink stops
          // propagation there, which would otherwise swallow a bubble-phase
          // onClick and lose every click on the link form. Passing our own
          // handler overrides ExternalLink's, as UpsellCta does.
          onClickCapture={() => trackUpsellClicked({ location, campaign })}
          onClick={() => triggerUpsellFlow?.()}
        >
          {t`Try Metabase Pro`}
        </Button>
      </Group>
    </Card>
  );
}
