import cx from "classnames";
import { type ReactNode, forwardRef, memo } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { BaseCell } from "metabase/data-grid/components/BaseCell/BaseCell";
import type {
  HeaderCellBaseProps,
  HeaderCellVariant,
} from "metabase/data-grid/types";
import { Icon } from "metabase/ui";

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
    return (
      <div
        ref={ref}
        data-grid-header-cell-content
        data-header-click-target
        className={cx(S.content, {
          [S.alignRight]: align === "right",
        })}
        data-testid="cell-data"
      >
        <Ellipsified tooltip={name}>{name}</Ellipsified>
        {sort != null ? (
          <Icon
            className={S.sortIndicator}
            data-testid="header-sort-indicator"
            name={sort === "asc" ? "chevronup" : "chevrondown"}
            size={10}
          />
        ) : null}
      </div>
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
        [S.light]: variant === "light",
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
