import { t } from "ttag";

import { Icon, Menu, Tooltip } from "metabase/ui";

export function PublicLinkMenuItem({
  hasPublicLink,
  disabledReason,
  onClick,
}: {
  hasPublicLink: boolean;
  disabledReason?: string;
  onClick: () => void;
}) {
  const label = hasPublicLink ? t`Public link` : t`Create a public link`;

  if (disabledReason) {
    return (
      <Tooltip label={disabledReason} maw="20rem" multiline>
        <Menu.Item
          component="div"
          disabled
          aria-disabled="true"
          leftSection={<Icon name="globe" aria-hidden />}
          data-testid="public-link-menu-item"
        >
          {label}
        </Menu.Item>
      </Tooltip>
    );
  }

  return (
    <Menu.Item
      leftSection={<Icon name="globe" aria-hidden />}
      onClick={onClick}
      data-testid="public-link-menu-item"
    >
      {label}
    </Menu.Item>
  );
}
