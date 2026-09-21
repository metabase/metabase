import type { DimensionPickerSidebarCategorySelectRow } from "metabase/metrics-viewer/utils";
import { Icon, Text, UnstyledButton } from "metabase/ui";

import S from "./SingleMetricDimensionList.module.css";

export function SingleMetricDimensionList({
  row,
  onChange,
}: {
  row: DimensionPickerSidebarCategorySelectRow;
  onChange: (dimensionId: string) => void;
}) {
  return (
    <div className={S.root}>
      {row.options.map((option) => {
        const isSelected = option.value === row.value;

        return (
          <UnstyledButton
            key={option.value}
            className={S.item}
            aria-label={option.label}
            aria-pressed={isSelected}
            onClick={() => onChange(option.value)}
          >
            <Icon className={S.itemIcon} name={option.icon} size={16} />
            <Text className={S.itemLabel} component="span">
              {option.label}
            </Text>
          </UnstyledButton>
        );
      })}
    </div>
  );
}
