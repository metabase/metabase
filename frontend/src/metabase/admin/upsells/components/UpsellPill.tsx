import { useMount } from "react-use";

import ExternalLink from "metabase/core/components/ExternalLink";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import S from "./Upsells.module.css";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";
export function _UpsellPill({
  children,
  link,
  campaign,
  source,
}: {
  children: React.ReactNode;
  link: string;
  campaign: string;
  source: string;
}) {
  const url = useUpsellLink({
    url: link,
    campaign,
    source,
  });

  useMount(() => {
    trackUpsellViewed({ source, campaign });
  });

  return (
    <ExternalLink
      href={url}
      onClickCapture={() => trackUpsellClicked({ source, campaign })}
      data-testid="upsell-pill"
      className={S.UpsellPillComponent}
    >
      <UpsellGem />
      {children}
    </ExternalLink>
  );
}

export const UpsellPill = UpsellWrapper(_UpsellPill);
