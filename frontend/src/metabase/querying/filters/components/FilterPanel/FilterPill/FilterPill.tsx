import type { HTMLAttributes, MouseEvent, Ref } from "react";
import { forwardRef } from "react";
import { t } from "ttag";

import { Icon } from "metabase/ui";

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
      lh="1.5rem"
      fw="bold"
      data-testid="filter-pill"
    >
      {children}
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
