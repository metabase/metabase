import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Icon, Menu } from "metabase/ui";

export function PublicLinkMenuItem({
  hasPublicLink,
  onClick,
}: {
  hasPublicLink: boolean;
  onClick: () => void;
}) {
  const isPublicSharingEnabled = useSetting("enable-public-sharing");

  if (!isPublicSharingEnabled) {
    return null;
  }

  return (
    <Menu.Item
      data-testid="embed-menu-public-link-item"
      leftSection={<Icon name="link" aria-hidden />}
      onClick={onClick}
    >
      {hasPublicLink ? t`Public link` : t`Create a public link`}
    </Menu.Item>
  );
}
