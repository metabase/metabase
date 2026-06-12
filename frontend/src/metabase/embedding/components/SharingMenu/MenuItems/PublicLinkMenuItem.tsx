import { t } from "ttag";

import { Icon, Menu } from "metabase/ui";

export function PublicLinkMenuItem({
  hasPublicLink,
  onClick,
}: {
  hasPublicLink: boolean;
  onClick: () => void;
}) {
  return (
    <Menu.Item
      data-testid="embed-menu-public-link-item"
      leftSection={<Icon name="globe" aria-hidden />}
      onClick={onClick}
    >
      {hasPublicLink ? t`Public link` : t`Create a public link`}
    </Menu.Item>
  );
}
