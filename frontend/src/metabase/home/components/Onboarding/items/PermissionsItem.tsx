import { t } from "ttag";

import PermissionsIllustration from "assets/img/onboarding_permissions.svg?component";
import { useSelector } from "metabase/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { getApplicationName } from "metabase/selectors/whitelabel";
import { Center, Text } from "metabase/ui";

import { ChecklistItem } from "../ChecklistItem";
import S from "../Onboarding.module.css";
import type { OnboardingItemProps } from "../types";

export const PermissionsItem = ({ itemRef }: OnboardingItemProps) => {
  const applicationName = useSelector(getApplicationName);
  const isAdmin = useSelector(getUserIsAdmin);

  return (
    <ChecklistItem
      value="permissions"
      icon="eye"
      label={t`Set up permissions`}
      itemRef={itemRef}
      actions={
        isAdmin
          ? [
              {
                label: t`Go to Admin`,
                to: "/admin/permissions",
                cta: "primary",
              },
            ]
          : undefined
      }
    >
      <Center className={S.illustration}>
        <PermissionsIllustration
          aria-label={t`A key unlocking a keyhole`}
          role="img"
        />
      </Center>
      <Text>
        {t`Create groups, set permissions on the groups, then add people to those groups. You can set permission on the data itself—down to individual rows and columns if you need to—as well as on collections of ${applicationName} charts and dashboards, and map groups via SSO.`}
      </Text>
    </ChecklistItem>
  );
};
