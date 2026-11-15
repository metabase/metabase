import { t } from "ttag";

import PermissionsIllustration from "assets/img/onboarding_permissions.svg?component";
import { getUserIsAdmin } from "metabase/current-user";
import { useSelector } from "metabase/redux";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Text } from "metabase/ui";

import type { ChecklistImageStyles } from "../ChecklistItem";
import { ChecklistItem, ChecklistMedia } from "../ChecklistItem";
import type { OnboardingItemProps } from "../types";

const ILLUSTRATION_STYLE: ChecklistImageStyles = {
  "--leaf-x": 118,
  "--leaf-y": 31,
  "--leaf-w": 325,
  "--leaf-h": 254,
};

export const PermissionsItem = ({ value, itemRef }: OnboardingItemProps) => {
  const applicationName = useSelector(getApplicationName);
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <ChecklistItem
      value={value}
      itemRef={itemRef}
      icon="eye"
      label={t`Set up permissions`}
      actions={
        isAdmin
          ? [
              {
                label: t`Go to permissions`,
                to: "/admin/permissions",
                cta: "primary",
              },
            ]
          : []
      }
    >
      <ChecklistMedia style={ILLUSTRATION_STYLE}>
        <PermissionsIllustration
          aria-label={t`A key unlocking a keyhole`}
          role="img"
        />
      </ChecklistMedia>
      <Text>
        {t`Create groups, set permissions on the groups, then add people to those groups. You can set permission on the data itself—down to individual rows and columns if you need to—as well as on collections of ${applicationName} charts and dashboards, and map groups via SSO.`}
      </Text>
    </ChecklistItem>
  );
};
