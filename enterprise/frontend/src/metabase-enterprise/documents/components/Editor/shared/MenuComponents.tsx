import type { DOMAttributes } from "react";
import { t } from "ttag";

import {
  Avatar,
  Group,
  Icon,
  type IconName,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import type { SuggestionModel } from "metabase-enterprise/rich_text_editing/tiptap/extensions/shared/types";

import S from "./MenuItems.module.css";

interface ExtraItemProps extends DOMAttributes<HTMLButtonElement> {
  isSelected?: boolean;
  onClick?: () => void;
}

export interface MenuItem {
  icon: IconName;
  iconColor?: string;
  label: string;
  description?: string;
  action: () => void;
  model?: SuggestionModel;
  id?: number | string;
  href?: string;
  hasSubmenu?: boolean;
}

export const MenuItemComponent = ({
  item,
  isSelected,
  onClick,
  ...rest
}: {
  item: MenuItem;
  isSelected?: boolean;
  onClick?: () => void;
} & DOMAttributes<HTMLButtonElement>) => (
  <UnstyledButton
    className={S.menuItem}
    onClick={onClick || item.action}
    role="option"
    aria-selected={isSelected}
    {...rest}
  >
    <Group gap="sm" wrap="nowrap" align="center">
      {item.model === "user" && <Avatar name={item.label} size={16} />}

      {item.model !== "user" && (
        <Icon name={item.icon} size={16} color={item.iconColor || "inherit"} />
      )}

      <Stack gap={2} className={S.menuItemStack}>
        <Text size="md" lh="lg" c="inherit">
          {item.label}
        </Text>
        {item.description && (
          <Text size="sm" c="text-disabled" lh="md">
            {item.description}
          </Text>
        )}
      </Stack>

      {item.hasSubmenu && (
        <Icon name="chevronright" size=".75rem" color="text-disabled" />
      )}
    </Group>
  </UnstyledButton>
);

export const SearchResultsFooter = ({
  isSelected,
  onClick,
  ...rest
}: ExtraItemProps) => (
  <UnstyledButton
    className={S.menuItem}
    onClick={onClick}
    role="option"
    aria-selected={isSelected}
    {...rest}
  >
    <Group gap="sm" wrap="nowrap" align="center">
      <Icon name="search" size={16} color="inherit" />
      <Text size="md" lh="lg" c="inherit">{t`Browse all`}</Text>
    </Group>
  </UnstyledButton>
);

export const CreateNewQuestionFooter = ({
  isSelected,
  onClick,
  ...rest
}: ExtraItemProps) => (
  <UnstyledButton
    className={S.menuItem}
    onClick={onClick}
    role="option"
    aria-selected={isSelected}
    {...rest}
  >
    <Group gap="sm" wrap="nowrap" align="center">
      <Icon name="add" size={16} color="inherit" />
      <Text size="md" lh="lg" c="inherit">{t`New chart`}</Text>
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
        <Text size="sm" c="text-disabled" lh="md">
          {t`It wants to help!`}
        </Text>
      </Stack>
    </Group>
  </UnstyledButton>
);
