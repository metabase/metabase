import { t } from "ttag";

import { ActionIcon, Card, Group, Icon, Menu, Text } from "metabase/ui";
import type { EmbeddingTheme } from "metabase-types/api/embedding-theme";

import { EmbeddingThemeCardPreview } from "./EmbeddingThemeCardPreview";

export function EmbeddingThemeCard({
  theme,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  theme: EmbeddingTheme;
  onEdit: (id: number) => void;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
}) {
  return (
    <Card
      p={0}
      withBorder
      onClick={() => onEdit(theme.id)}
      style={{ cursor: "pointer" }}
    >
      <EmbeddingThemeCardPreview theme={theme.settings} />

      <Group align="center" justify="space-between" px="md" py="sm">
        <Text fz="lg">{theme.name}</Text>

        <EmbeddingThemeActionMenu
          theme={theme}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </Group>
    </Card>
  );
}

const EmbeddingThemeActionMenu = ({
  theme,
  onDuplicate,
  onDelete,
}: {
  theme: Omit<EmbeddingTheme, "settings">;
  onDuplicate: (id: number) => void;
  onDelete: (id: number) => void;
}) => {
  return (
    <Menu position="bottom-end">
      {/* stopPropagation prevents triggering the card's onEdit when clicking the menu */}
      <Menu.Target>
        <ActionIcon
          aria-label={t`Duplicate and delete`}
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="ellipsis" />
        </ActionIcon>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item onClick={() => onDuplicate(theme.id)}>
          {t`Duplicate`}
        </Menu.Item>

        <Menu.Item c="error" onClick={() => onDelete(theme.id)}>
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
