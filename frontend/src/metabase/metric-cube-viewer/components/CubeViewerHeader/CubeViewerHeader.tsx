import { t } from "ttag";

import {
  ActionIcon,
  Button,
  Ellipsified,
  Group,
  Icon,
  Menu,
  Title,
} from "metabase/ui";

export interface CubeViewerHeaderProps {
  title: string;
  onOpenSettings: () => void;
  onReset: () => void;
}

export function CubeViewerHeader({
  title,
  onOpenSettings,
  onReset,
}: CubeViewerHeaderProps) {
  return (
    <Group justify="space-between" wrap="nowrap" gap="md">
      <Title order={2} miw={0} flex={1}>
        <Ellipsified>{title}</Ellipsified>
      </Title>
      <Group gap="sm" wrap="nowrap" flex="0 0 auto">
        <Button
          variant="default"
          leftSection={<Icon name="gear" />}
          onClick={onOpenSettings}
        >
          {t`Settings`}
        </Button>
        <Menu position="bottom-end">
          <Menu.Target>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label={t`More options`}
            >
              <Icon name="ellipsis" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item leftSection={<Icon name="revert" />} onClick={onReset}>
              {t`Reset viewer`}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Group>
    </Group>
  );
}
