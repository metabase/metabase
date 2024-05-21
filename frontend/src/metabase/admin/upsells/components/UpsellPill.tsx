import { useMount } from "react-use";

import { UpsellGem } from "./UpsellGem";
import { UpsellWrapper } from "./UpsellWrapper";
import { UpsellPillComponent } from "./Upsells.styled";
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
    <UpsellPillComponent
      href={url}
      onClickCapture={() => trackUpsellClicked({ source, campaign })}
      data-testid="upsell-pill"
    >
      <UpsellGem />
      {children}
    </UpsellPillComponent>
  );
}

export const UpsellPill = UpsellWrapper(_UpsellPill);
