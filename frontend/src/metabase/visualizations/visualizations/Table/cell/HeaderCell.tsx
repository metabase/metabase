import cx from "classnames";
import type React from "react";
import { memo } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/ui";

import styles from "./HeaderCell.module.css";

export type HeaderCellProps = {
  align?: "left" | "right";
  name?: React.ReactNode;
  sort?: "asc" | "desc";
};

export const HeaderCell = memo(function HeaderCell({
  name,
  align = "left",
  sort,
}: HeaderCellProps) {
  return (
    <div
      className={cx(styles.root, {
        [styles.leftAligned]: align === "left",
        [styles.rightAligned]: align === "right",
      })}
    >
      <div data-grid-header-cell-content className={styles.content}>
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
