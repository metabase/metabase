import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getUserIsAdmin } from "metabase/selectors/user";
import { Center, Icon, Menu, Title } from "metabase/ui";

export function EmbedMenuItem({ onClick }: { onClick: () => void }) {
  const isAdmin = useSelector(getUserIsAdmin);

  if (!isAdmin) {
    return null;
  }

  return (
    <Menu.Item
      data-testid="embed-menu-embed-modal-item"
      py="sm"
      icon={
        <Center mr="xs">
          <Icon name="embed" aria-hidden />
        </Center>
      }
      onClick={onClick}
    >
      <Title order={4}>{t`Embed`}</Title>
    </Menu.Item>
  );
}
