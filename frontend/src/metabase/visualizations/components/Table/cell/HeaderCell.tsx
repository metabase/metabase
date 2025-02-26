import cx from "classnames";
import { type ReactNode, forwardRef, memo } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/ui";

import type { HeaderCellBaseProps, HeaderCellVariant } from "../types";

import { BaseCell } from "./BaseCell";
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
      <HeaderCellPill name={name} sort={sort} />
    </HeaderCellWrapper>
  );
});

export const HeaderCellPill = forwardRef<HTMLDivElement, HeaderCellBaseProps>(
  function HeaderCellPill({ name, sort }: HeaderCellBaseProps, ref) {
    return (
      <div
        ref={ref}
        data-grid-header-cell-content
        data-header-click-target
        className={S.content}
        data-testid="cell-data"
      >
        {sort != null ? (
          <Icon
            mr="0.25rem"
            name={sort === "asc" ? "chevronup" : "chevrondown"}
            size={10}
          />
        ) : null}
        <Ellipsified tooltip={name}>{name}</Ellipsified>
      </div>
    );
  },
);

export interface HeaderCellWrapperProp extends HeaderCellProps {
  children: ReactNode;
}

export const HeaderCellWrapper = ({
  variant,
  align,
  children,
}: HeaderCellWrapperProp) => {
  return (
    <BaseCell
      className={cx(S.root, {
        [S.light]: variant === "light",
        [S.outline]: variant === "outline",
      })}
      align={align}
      role="columnheader"
      data-testid="header-cell"
    >
      {children}
    </BaseCell>
  );
};
