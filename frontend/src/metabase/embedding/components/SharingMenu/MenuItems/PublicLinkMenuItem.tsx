import { t } from "ttag";

import Link from "metabase/common/components/Link";
import { useSetting } from "metabase/common/hooks";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Icon, Menu } from "metabase/ui";

export function PublicLinkMenuItem({
  hasPublicLink,
  onClick,
}: {
  hasPublicLink: boolean;
  onClick: () => void;
}) {
  const isPublicSharingEnabled = useSetting("enable-public-sharing");
  const isAdmin = useSelector(getUserIsAdmin);

  if (isAdmin) {
    return (
      <Menu.Item
        data-testid="embed-menu-public-link-item"
        leftSection={<Icon name="link" aria-hidden />}
        softDisabled={!isPublicSharingEnabled}
        rightSection={
          !isPublicSharingEnabled ? (
            <Link
              to="/admin/settings/public-sharing"
              target="_blank"
              variant="brand"
            >
              {t`Enable`}
            </Link>
          ) : undefined
        }
        onClick={onClick}
      >
        {isPublicSharingEnabled
          ? hasPublicLink
            ? t`Public link`
            : t`Create a public link`
          : t`Public link`}
      </Menu.Item>
    );
  }

  return (
    <Menu.Item
      data-testid="embed-menu-public-link-item"
      leftSection={<Icon name="link" aria-hidden />}
      onClick={onClick}
      disabled={!hasPublicLink}
    >
      {hasPublicLink
        ? t`Public link`
        : t`Ask your admin to create a public link`}
    </Menu.Item>
  );
}
