import cx from "classnames";
import type React from "react";
import { type MouseEvent, memo } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/ui";

import styles from "./HeaderCell.module.css";

export type HeaderCellProps = {
  align?: "left" | "right";
  name?: React.ReactNode;
  sort?: "asc" | "desc";
  onClick?: (event: MouseEvent<HTMLDivElement>) => void;
};

export const HeaderCell = memo(function HeaderCell({
  name,
  align = "left",
  sort,
  onClick,
}: HeaderCellProps) {
  return (
    <div
      className={cx(styles.root, {
        [styles.leftAligned]: align === "left",
        [styles.rightAligned]: align === "right",
      })}
    >
      <div
        data-grid-header-cell-content
        className={styles.content}
        onClick={onClick}
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
    </div>
  );
});
