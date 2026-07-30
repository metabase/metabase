import { t } from "ttag";

import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";

import { ChecklistImage, ChecklistItem } from "../ChecklistItem";
import type { OnboardingItemProps } from "../types";

export const InviteItem = ({ itemRef }: OnboardingItemProps) => {
  const applicationName = useSelector(getApplicationName);

  return (
    <ChecklistItem
      value="invite"
      icon="group"
      label={t`Invite people to your ${applicationName}`}
      itemRef={itemRef}
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
      />
      <Text>
        {t`You can invite people via email right away, even if you'll go on to set up single sign-on with your identity provider later on.`}
      </Text>
    </ChecklistItem>
  );
};
