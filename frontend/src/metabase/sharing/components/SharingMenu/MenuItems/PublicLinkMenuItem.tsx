import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Center, Icon, Menu, Stack, Text, Title } from "metabase/ui";

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
        my="sm"
        leftSection={
          <Center mr="xs">
            <Icon name="link" />
          </Center>
        }
        onClick={onClick}
      >
        {isPublicSharingEnabled ? (
          <Title order={4}>
            {hasPublicLink ? t`Public link` : t`Create a public link`}
          </Title>
        ) : (
          <Link to="/admin/settings/public-sharing" target="_blank">
            <Stack gap="xs">
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
      my="sm"
      leftSection={
        <Center mr="xs">
          <Icon name="link" />
        </Center>
      }
      onClick={onClick}
      disabled={!hasPublicLink}
    >
      <Title order={4} c="inherit">
        {hasPublicLink
          ? t`Public link`
          : t`Ask your admin to create a public link`}
      </Title>
    </Menu.Item>
  );
}
