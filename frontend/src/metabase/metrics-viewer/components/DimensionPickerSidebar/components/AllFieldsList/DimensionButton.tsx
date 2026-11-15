import type { DimensionPickerItem } from "metabase/metrics-viewer/utils";
import { Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./DimensionButton.module.css";

export function DimensionButton({
  item,
  isSelected,
  onClick,
}: {
  item: DimensionPickerItem;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <UnstyledButton
      className={S.item}
      data-selected={isSelected || undefined}
      aria-label={item.name}
      aria-pressed={isSelected}
      onClick={onClick}
    >
      <Icon className={S.itemIcon} name={item.icon} size={16} />
      <Text className={S.itemLabel} component="span">
        {item.name}
      </Text>
    </UnstyledButton>
  );
}
