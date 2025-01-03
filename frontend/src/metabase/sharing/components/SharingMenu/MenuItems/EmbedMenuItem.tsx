import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Icon, Menu } from "metabase/ui";

export function EmbedMenuItem({ onClick }: { onClick: () => void }) {
  const isAdmin = useSelector(getUserIsAdmin);

  if (!isAdmin) {
    return null;
  }

  return (
    <Menu.Item
      data-testid="embed-menu-embed-modal-item"
      icon={<Icon name="embed" aria-hidden />}
      onClick={onClick}
    >
      {t`Embed`}
    </Menu.Item>
  );
}
