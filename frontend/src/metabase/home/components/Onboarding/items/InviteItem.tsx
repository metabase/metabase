import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";

import type { ChecklistImageStyles } from "../ChecklistItem";
import { ChecklistImage, ChecklistItem } from "../ChecklistItem";
import type { OnboardingItemProps } from "../types";

/* Hangs off the bottom of the frame rather than the top, so it anchors to the
   block end and only rounds the corner that stays inside. */
const ILLUSTRATION_STYLE: ChecklistImageStyles = {
  "--leaf-x": -1,
  "--leaf-w": 511,
  "--leaf-h": 267,
  "--leaf-block-start": "auto",
  "--leaf-block-end": "calc(-1 * var(--media-unit))",
  "--leaf-radius": "0 calc(7 * var(--media-unit)) 0 0",
  "--leaf-shadow": "var(--media-leaf-elevation)",
};

export const InviteItem = ({ value, itemRef }: OnboardingItemProps) => {
  const applicationName = useSelector(getApplicationName);

  return (
    <ChecklistItem
      value={value}
      itemRef={itemRef}
      icon="group"
      label={t`Invite people to your ${applicationName}`}
      actions={[
        { label: t`Invite people`, to: "/admin/people", cta: "primary" },
        {
          label: t`Set up single sign-on`,
          to: "/admin/settings/authentication",
          cta: "secondary",
        },
      ]}
    >
      <ChecklistImage
        alt={t`Admin panel with the "Invite someone" button`}
        src="app/assets/img/onboarding_invite.png"
        srcSet="app/assets/img/onboarding_invite@2x.png 2x"
        style={ILLUSTRATION_STYLE}
      />
      <Text>
        {t`You can invite people via email right away, even if you'll go on to set up single sign-on with your identity provider later on.`}
      </Text>
    </ChecklistItem>
  );
};
