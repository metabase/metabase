import cx from "classnames";
import { type ComponentPropsWithoutRef, forwardRef } from "react";

import { Ellipsified } from "metabase/common/components/Ellipsified";
import { Icon } from "metabase/ui";

import S from "./SortableHeaderPill.module.css";

interface SortableHeaderPillProps extends ComponentPropsWithoutRef<"div"> {
  name: string;
  sort?: "asc" | "desc";
  align?: "left" | "right";
}

export const SortableHeaderPill = forwardRef<
  HTMLDivElement,
  SortableHeaderPillProps
>(function SortableHeaderPill({ name, sort, align, className, ...props }, ref) {
  return (
    <div
      ref={ref}
      className={cx(S.pill, className, { [S.alignRight]: align === "right" })}
      {...props}
    >
      <Ellipsified tooltip={name}>{name}</Ellipsified>
      {sort && (
        <Icon
          name={sort === "asc" ? "chevronup" : "chevrondown"}
          size={10}
          className={S.sortIcon}
          data-testid="header-sort-indicator"
        />
      )}
    </div>
  );
});
