import { t } from "ttag";

import { ActionIcon, Card, Flex, Icon, Menu, Text } from "metabase/ui";
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
      data-testid={`theme-card-${theme.name}`}
    >
      <EmbeddingThemeCardPreview theme={theme.settings} />

      <Flex align="center" justify="space-between" px="md" py="sm">
        <Text fz="lg" truncate="end" title={theme.name}>
          {theme.name}
        </Text>

        <EmbeddingThemeActionMenu
          theme={theme}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      </Flex>
    </Card>
  );
}

const EmbeddingThemeActionMenu = ({
  theme,
  onDuplicate,
  onDelete,
  onEdit,
}: {
  theme: Omit<EmbeddingTheme, "settings">;
  onEdit: (id: number) => void;
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
        <Menu.Item
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onEdit(theme.id);
          }}
        >
          {t`Edit`}
        </Menu.Item>
        <Menu.Item
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onDuplicate(theme.id);
          }}
        >
          {t`Duplicate`}
        </Menu.Item>

        <Menu.Item
          c="error"
          onClick={(e: React.MouseEvent) => {
            e.stopPropagation();
            onDelete(theme.id);
          }}
        >
          {t`Delete`}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
