import { t } from "ttag";

import { Link } from "metabase/common/components/Link";
import { useSetting } from "metabase/common/hooks";
import CS from "metabase/css/core/index.css";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Button, Icon, Menu } from "metabase/ui";

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
        onClick={onClick}
        {...(!isPublicSharingEnabled && {
          onClick: undefined,
          component: "div",
          disabled: true,
        })}
      >
        {isPublicSharingEnabled ? (
          hasPublicLink ? (
            t`Public link`
          ) : (
            t`Create a public link`
          )
        ) : (
          <>
            {t`Public link`}
            <Button
              component={Link}
              to="/admin/settings/public-sharing"
              target="_blank"
              variant="subtle"
              h="auto"
              lh="inherit"
              ml="sm"
              p={0}
              bd={0}
              className={CS.floatRight}
            >
              {t`Enable`}
            </Button>
          </>
        )}
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
