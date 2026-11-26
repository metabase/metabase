import cx from "classnames";

import { ActionIcon, Flex, Icon, Text, UnstyledButton } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./CategoryButton.module.css";

/** Copy of the Metric Explorer's Break out sidebar row, with a note under the name. */
export function CategoryButton({
  name,
  icon,
  note,
  isSelected,
  isExpanded,
  onClick,
  onConfigure,
}: {
  name: string;
  icon: IconName;
  note?: string;
  isSelected: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onConfigure: () => void;
}) {
  return (
    <Flex
      className={cx(S.categoryRow, {
        [S.expanded]: isExpanded,
        [S.selected]: isSelected,
      })}
    >
      <UnstyledButton
        className={S.categoryItem}
        aria-pressed={isSelected}
        aria-label={name}
        onClick={onClick}
      >
        <Icon className={S.itemIcon} name={icon} size={16} />
        <Text className={S.itemLabel} component="span">
          {name}
          {note && (
            <Text component="span" fz="xs" c="text-secondary" ml="sm">
              {note}
            </Text>
          )}
        </Text>
      </UnstyledButton>
      <ActionIcon
        className={S.settingsButton}
        aria-label={`Configure ${name}`}
        aria-expanded={isExpanded}
        variant="light"
        selected={isExpanded}
        onClick={onConfigure}
      >
        <Icon name="sliders" />
      </ActionIcon>
    </Flex>
  );
}
