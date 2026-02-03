import { useMount } from "react-use";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UnstyledButton } from "metabase/ui";

import { UpsellGem } from "./UpsellGem";
import S from "./UpsellPill.module.css";
import { UpsellWrapper } from "./UpsellWrapper";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";
import { useUpsellLink } from "./use-upsell-link";

export function UpsellPillInner({
  children,
  link,
  campaign,
  source: location,
  onClick,
}: {
  children: React.ReactNode;
  link: string;
  campaign: string;
  source: string;
  onClick?: () => void;
}) {
  const url = useUpsellLink({
    url: link,
    campaign,
    location,
  });

  useMount(() => {
    trackUpsellViewed({ location, campaign });
  });

  if (onClick) {
    return (
      <UnstyledButton
        onClick={() => {
          trackUpsellClicked({ location, campaign });
          onClick();
        }}
        className={S.UpsellPillComponent}
      >
        <UpsellGem />
        {children}
      </UnstyledButton>
    );
  }

  return (
    <ExternalLink
      href={url}
      onClickCapture={() => trackUpsellClicked({ location, campaign })}
      data-testid="upsell-pill"
      className={S.UpsellPillComponent}
    >
      <UpsellGem />
      {children}
    </ExternalLink>
  );
}

export const UpsellPill = UpsellWrapper(UpsellPillInner);
