import cx from "classnames";
import { t } from "ttag";

import { Box, Group, Icon, type IconName, Text } from "metabase/ui";
import type { SearchModel } from "metabase-types/api";

import styles from "../Editor.module.css";

interface ExtraItemProps {
  isSelected?: boolean;
  onClick?: () => void;
}

export interface MenuItem {
  icon: IconName;
  iconColor?: string;
  label: string;
  description?: string;
  action: () => void;
  model?: SearchModel;
  id?: number | string;
}

export const MenuItemComponent = ({
  item,
  isSelected,
  onClick,
}: {
  item: MenuItem;
  isSelected?: boolean;
  onClick?: () => void;
}) => (
  <Box
    p="sm"
    className={styles.suggestionMenuItem}
    data-selected={isSelected || undefined}
    onClick={onClick || item.action}
  >
    <Group gap="sm" wrap="nowrap">
      <Icon
        name={item.icon}
        size={16}
        color={item.iconColor || "var(--mb-color-text-medium)"}
      />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text size="md" fw={500} truncate>
          {item.label}
        </Text>
        {item.description && (
          <Text size="sm" c="text-medium" truncate>
            {item.description}
          </Text>
        )}
      </Box>
    </Group>
  </Box>
);

export const SearchResultsFooter = ({
  isSelected,
  onClick,
}: ExtraItemProps) => (
  <Box
    p="sm"
    className={styles.suggestionMenuItem}
    data-selected={isSelected || undefined}
    onClick={onClick}
  >
    <Group gap="sm" wrap="nowrap">
      <Icon name="search" size={16} color="var(--mb-color-text-medium)" />
      <Text size="md" fw={500}>
        {t`Browse all`}
      </Text>
    </Group>
  </Box>
);

export const MetabotFooter = ({ isSelected, onClick }: ExtraItemProps) => (
  <Box
    p="sm"
    className={cx(styles.suggestionMenuItem, styles.suggestionMenuFooter)}
    data-selected={isSelected || undefined}
    onClick={onClick}
  >
    <Group gap="sm" wrap="nowrap">
      <Icon name="metabot" size={16} color="var(--mb-color-text-medium)" />
      <Box style={{ flex: 1, minWidth: 0 }}>
        <Text size="md" fw={500} truncate>
          {t`Ask Metabot`}
        </Text>
        <Text size="sm" c="text-medium" truncate>
          {t`It wants to help!`}
        </Text>
      </Box>
    </Group>
  </Box>
);
