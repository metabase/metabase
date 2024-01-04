import type { HTMLAttributes, MouseEvent, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";
import { Text } from "metabase/ui";
import { Icon } from "metabase/core/components/Icon";
import { FilterPillRoot } from "./FilterPill.styled";

interface FilterPillProps extends HTMLAttributes<HTMLDivElement> {
  onRemoveClick?: () => void;
}

export const FilterPill = forwardRef(function FilterPill(
  { children, onRemoveClick, ...props }: FilterPillProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleRemoveClick = (event: MouseEvent) => {
    event.stopPropagation();
    onRemoveClick?.();
  };

  return (
    <FilterPillRoot
      {...props}
      ref={ref}
      align="center"
      gap="sm"
      px="sm"
      data-testid="filter-pill"
    >
      <Text color="inherit" weight="bold">
        {children}
      </Text>
      <Icon
        name="close"
        size={12}
        role="button"
        aria-label={t`Remove`}
        onClick={handleRemoveClick}
      />
    </FilterPillRoot>
  );
});
