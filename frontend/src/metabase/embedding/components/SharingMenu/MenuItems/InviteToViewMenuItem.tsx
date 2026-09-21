import { t } from "ttag";

import { Icon, Menu } from "metabase/ui";

export function InviteToViewMenuItem({ onClick }: { onClick: () => void }) {
  return (
    <Menu.Item
      leftSection={<Icon name="person" aria-hidden />}
      onClick={onClick}
    >
      {t`Invite someone to view this`}
    </Menu.Item>
  );
}
