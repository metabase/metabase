import { t } from "ttag";

import { Icon, Menu } from "metabase/ui";

export function EmbedMenuItem({ onClick }: { onClick: () => void }) {
  return (
    <Menu.Item
      data-testid="embed-menu-embed-modal-item"
      leftSection={<Icon name="embed" aria-hidden />}
      onClick={onClick}
    >
      {t`Embed`}
    </Menu.Item>
  );
}
