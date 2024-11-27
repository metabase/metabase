import { t } from "ttag";

import { Center, Icon, Menu, Title } from "metabase/ui";

export function EmbedMenuItem({ onClick }: { onClick: () => void }) {
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
