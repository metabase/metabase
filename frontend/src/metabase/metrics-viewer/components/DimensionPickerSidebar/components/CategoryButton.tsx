import cx from "classnames";
import { t } from "ttag";

import type { DimensionPickerSidebarCategory } from "metabase/metrics-viewer/utils";
import { ActionIcon, Flex, Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./CategoryButton.module.css";

type CategoryButtonProps = {
  item: DimensionPickerSidebarCategory;
  isSelected: boolean;
  canConfigure: boolean;
  isExpanded: boolean;
  onClick: () => void;
  onConfigure: () => void;
};

export function CategoryButton({
  item,
  isSelected,
  canConfigure,
  isExpanded,
  onClick,
  onConfigure,
}: CategoryButtonProps) {
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
        aria-label={item.name}
        onClick={onClick}
      >
        <Icon className={S.itemIcon} name={item.icon} size={16} />
        <Text className={S.itemLabel} component="span">
          {item.name}
        </Text>
      </UnstyledButton>
      {canConfigure && (
        <ActionIcon
          className={S.settingsButton}
          aria-label={t`Configure ${item.name}`}
          aria-expanded={isExpanded}
          variant="subtle"
          onClick={onConfigure}
        >
          <Icon name="sliders" />
        </ActionIcon>
      )}
    </Flex>
  );
}
