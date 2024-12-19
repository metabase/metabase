import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Icon, Menu, Stack, Text, Title } from "metabase/ui";

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
        icon={<Icon name="link" aria-hidden />}
        onClick={onClick}
      >
        {isPublicSharingEnabled ? (
          hasPublicLink ? (
            t`Public link`
          ) : (
            t`Create a public link`
          )
        ) : (
          <Link to="/admin/settings/public-sharing" target="_blank">
            <Stack spacing="xs">
              <Title order={4}>{t`Public links are off`}</Title>
              <Text size="sm">{t`Enable them in settings`}</Text>
            </Stack>
          </Link>
        )}
      </Menu.Item>
    );
  }

  return (
    <Menu.Item
      data-testid="embed-menu-public-link-item"
      icon={<Icon name="link" aria-hidden />}
      onClick={onClick}
      disabled={!hasPublicLink}
    >
      {hasPublicLink
        ? t`Public link`
        : t`Ask your admin to create a public link`}
    </Menu.Item>
  );
}
