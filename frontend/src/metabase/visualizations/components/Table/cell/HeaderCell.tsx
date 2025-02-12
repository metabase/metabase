import type React from "react";
import { memo } from "react";

import { Ellipsified } from "metabase/core/components/Ellipsified";
import { Icon } from "metabase/ui";

import type { TextAlign } from "../types";

import { BaseCell } from "./BaseCell";
import S from "./HeaderCell.module.css";

export type HeaderCellProps = {
  align?: TextAlign;
  name?: React.ReactNode;
  sort?: "asc" | "desc";
};

export const HeaderCell = memo(function HeaderCell({
  name,
  align,
  sort,
}: HeaderCellProps) {
  return (
    <BaseCell
      className={S.root}
      align={align}
      role="columnheader"
      data-testid="header-cell"
    >
      <div
        data-grid-header-cell-content
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
    </BaseCell>
  );
});
