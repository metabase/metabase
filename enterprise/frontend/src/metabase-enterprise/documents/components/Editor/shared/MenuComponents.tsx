import { t } from "ttag";

import {
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { SearchModel } from "metabase-types/api";

import S from "./MenuItems.module.css";

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
  <UnstyledButton
    className={S.menuItem}
    onClick={onClick || item.action}
    role="option"
    aria-selected={isSelected}
  >
    <Group gap="sm" wrap="nowrap" align="center">
      <Icon name={item.icon} size={16} color={item.iconColor || "inherit"} />
      <Stack gap={2} style={{ flex: 1 }}>
        <Text size="md" lh="lg" c="inherit">
          {item.label}
        </Text>
        {item.description && (
          <Text size="sm" c="text-light" lh="md">
            {item.description}
          </Text>
        )}
      </Stack>
    </Group>
  </UnstyledButton>
);

export const SearchResultsFooter = ({
  isSelected,
  onClick,
}: ExtraItemProps) => (
  <UnstyledButton
    className={S.menuItem}
    onClick={onClick}
    role="option"
    aria-selected={isSelected}
  >
    <Group gap="sm" wrap="nowrap" align="center">
      <Icon name="search" size={16} color="inherit" />
      <Text size="md" lh="lg" c="inherit">{t`Browse all`}</Text>
    </Group>
  </UnstyledButton>
);

export const MetabotFooter = ({ isSelected, onClick }: ExtraItemProps) => (
  <UnstyledButton
    className={S.menuItemWithBorder}
    onClick={onClick}
    role="option"
    aria-selected={isSelected}
  >
    <Group gap="sm" wrap="nowrap" align="center">
      <Icon name="metabot" size={16} color="inherit" />
      <Stack gap={2}>
        <Text size="md" lh="lg" c="inherit">{t`Ask Metabot`}</Text>
        <Text size="sm" c="text-light" lh="md">
          {t`It wants to help!`}
        </Text>
      </Stack>
    </Group>
  </UnstyledButton>
);
