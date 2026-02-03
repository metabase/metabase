import cx from "classnames";
import { type ReactNode, forwardRef, memo } from "react";

import { BaseCell } from "metabase/data-grid/components/BaseCell/BaseCell";
import type {
  HeaderCellBaseProps,
  HeaderCellVariant,
} from "metabase/data-grid/types";
import { SortableHeaderPill } from "metabase/ui";

import S from "./HeaderCell.module.css";

export interface HeaderCellProps extends HeaderCellBaseProps {
  variant?: HeaderCellVariant;
}

export const HeaderCell = memo(function HeaderCell({
  name,
  align,
  sort,
  variant = "light",
}: HeaderCellProps) {
  return (
    <HeaderCellWrapper variant={variant} align={align}>
      <HeaderCellPill name={name} sort={sort} align={align} />
    </HeaderCellWrapper>
  );
});

export const HeaderCellPill = forwardRef<HTMLDivElement, HeaderCellBaseProps>(
  function HeaderCellPillInner(
    { name, sort, align }: HeaderCellBaseProps,
    ref,
  ) {
    const pillAlign = align === "right" ? "right" : "left";

    return (
      <SortableHeaderPill
        ref={ref}
        name={typeof name === "string" ? name : ""}
        sort={sort}
        align={pillAlign}
        className={S.content}
        data-grid-header-cell-content
        data-header-click-target
        data-testid="cell-data"
      />
    );
  },
);

export interface HeaderCellWrapperProp extends HeaderCellProps {
  className?: string;
  children: ReactNode;
}

export const HeaderCellWrapper = ({
  className,
  variant,
  align,
  children,
}: HeaderCellWrapperProp) => {
  return (
    <BaseCell
      className={cx(S.root, className, {
        [S.outline]: variant === "outline",
      })}
      hasHover={false}
      align={align}
      role="columnheader"
      data-testid="header-cell"
    >
      {children}
    </BaseCell>
  );
};
