import { useMount } from "react-use";

import { ExternalLink } from "metabase/common/components/ExternalLink";
import { UnstyledButton } from "metabase/ui";

import { useUpgradeAction } from "./UpgradeModal";
import { UpsellGem } from "./UpsellGem";
import S from "./UpsellPill.module.css";
import { UpsellWrapper } from "./UpsellWrapper";
import { trackUpsellClicked, trackUpsellViewed } from "./analytics";

export function _UpsellPill({
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
  const {
    onClick: upgradeOnClick,
    url: upgradeUrl,
    modal,
  } = useUpgradeAction({
    url: link,
    campaign,
    location,
  });

  useMount(() => {
    trackUpsellViewed({ location, campaign });
  });

  // Use onClick if provided, otherwise use upgrade action
  const handleClick = onClick ?? upgradeOnClick;

  if (handleClick) {
    return (
      <>
        <UnstyledButton
          onClick={handleClick}
          onClickCapture={() => trackUpsellClicked({ location, campaign })}
          className={S.UpsellPillComponent}
          data-testid="upsell-pill"
        >
          <UpsellGem />
          {children}
        </UnstyledButton>
        {modal}
      </>
    );
  }

  return (
    <>
      <ExternalLink
        href={upgradeUrl}
        onClickCapture={() => trackUpsellClicked({ location, campaign })}
        data-testid="upsell-pill"
        className={S.UpsellPillComponent}
      >
        <UpsellGem />
        {children}
      </ExternalLink>
      {modal}
    </>
  );
}

export const UpsellPill = UpsellWrapper(_UpsellPill);
