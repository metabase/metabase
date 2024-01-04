import { forwardRef } from "react";
import type { MouseEvent, Ref, ReactNode } from "react";
import { t } from "ttag";
import { Icon } from "metabase/core/components/Icon";
import { FilterPillRoot } from "./FilterPill.styled";

interface FilterPillProps {
  children?: ReactNode;
  onClick?: () => void;
  onRemoveClick: () => void;
}

export const FilterPill = forwardRef(function FilterPill(
  { children, onClick, onRemoveClick }: FilterPillProps,
  ref: Ref<HTMLDivElement>,
) {
  const handleRemoveClick = (event: MouseEvent) => {
    event.stopPropagation();
    onRemoveClick();
  };

  return (
    <FilterPillRoot ref={ref} onClick={onClick}>
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
