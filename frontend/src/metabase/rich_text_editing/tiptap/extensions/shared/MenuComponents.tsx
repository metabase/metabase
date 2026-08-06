import type { DOMAttributes, MouseEvent } from "react";
import { t } from "ttag";

import { EntityIcon } from "metabase/common/components/EntityIcon";
import type { SuggestionModel } from "metabase/rich_text_editing/tiptap/extensions/shared/types";
import {
  Avatar,
  Group,
  Icon,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { ColorName } from "metabase/ui/colors/types";
import type { IconName } from "metabase-types/api";

import S from "./MenuItems.module.css";

interface ExtraItemProps extends DOMAttributes<HTMLButtonElement> {
  isSelected?: boolean;
  onClick?: () => void;
}

export interface MenuItem {
  icon: IconName;
  iconUrl?: string;
  iconColor?: ColorName;
  label: string;
  description?: string;
  action: () => void;
  model?: SuggestionModel;
  id?: number | string;
  href?: string;
  hasSubmenu?: boolean;
  display?: string | null;
}

export const MenuItemComponent = ({
  item,
  isSelected,
  onClick,
  isDisabled,
  disabledReason,
  ...rest
}: {
  item: MenuItem;
  isSelected?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  isDisabled?: boolean;
  disabledReason?: string;
} & DOMAttributes<HTMLButtonElement>) => {
  const button = (
    <UnstyledButton
      className={S.menuItem}
      onClick={isDisabled ? undefined : onClick || (() => item.action())}
      role="option"
      aria-selected={isSelected}
      aria-disabled={isDisabled || undefined}
      data-disabled={isDisabled || undefined}
      {...rest}
    >
      <Group gap="sm" wrap="nowrap" align="center">
        {item.model === "user" && <Avatar name={item.label} size={16} />}

        {item.model !== "user" && (
          <EntityIcon
            name={item.icon}
            iconUrl={item.iconUrl}
            size="1rem"
            color={item.iconColor || "inherit"}
          />
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
          <Icon name="chevronright" size=".75rem" c="text-disabled" />
        )}
      </Group>
    </UnstyledButton>
  );

  if (isDisabled && disabledReason) {
    return (
      <Tooltip label={disabledReason} maw="20rem" multiline>
        {button}
      </Tooltip>
    );
  }

  return button;
};

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
      <Icon name="search" size={16} c="inherit" />
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
      <Icon name="add" size={16} c="inherit" />
      <Text size="md" lh="lg" c="inherit">{t`New chart`}</Text>
    </Group>
  </UnstyledButton>
);
