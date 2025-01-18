import cx from "classnames";
import {
  type HTMLAttributes,
  type MouseEventHandler,
  memo,
  useCallback,
} from "react";

import CS from "metabase/css/core/index.css";
import { ExpandButton } from "metabase/visualizations/components/TableInteractive/TableInteractive.styled";
import type { TableCellFormatter } from "metabase/visualizations/types";
import type { RowValue } from "metabase-types/api";

import S from "./BodyCell.module.css";

export type BodyCellVariant = "text" | "pill" | "minibar";

export type BodyCellProps = {
  value: RowValue;
  formatter?: TableCellFormatter;
  backgroundColor?: string;
  align?: "left" | "right";
  variant?: BodyCellVariant;
  wrap?: boolean;
  canExpand?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onExpand?: () => void;
  contentAttributes?: HTMLAttributes<HTMLDivElement>;
};

export const BodyCell = memo(function BodyCell({
  value,
  formatter,
  backgroundColor,
  align = "left",
  variant = "text",
  wrap = false,
  canExpand = false,
  contentAttributes,
  onClick,
  onExpand,
}: BodyCellProps) {
  const formattedValue = formatter ? formatter(value) : value;

  const handleExpandClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    e => {
      e.stopPropagation();
      onExpand?.();
    },
    [onExpand],
  );

  return (
    <div
      className={cx(S.root, CS.hoverParent, CS.hoverVisibility, {
        [S.clickable]: !!onClick,
        [S.alignLeft]: align === "left",
        [S.alignRight]: align === "right",
      })}
      style={{
        backgroundColor,
      }}
      onClick={onClick}
    >
      <div
        data-grid-cell-content
        className={cx(S.content, {
          [S.noWrap]: !wrap,
          [S.pill]: variant === "pill",
          [S.minibar]: variant === "minibar",
        })}
        {...contentAttributes}
      >
        {formattedValue}
      </div>

      {canExpand && (
        <ExpandButton
          className={CS.hoverChild}
          data-testid="expand-column"
          small
          borderless
          iconSize={10}
          icon="ellipsis"
          onlyIcon
          onClick={handleExpandClick}
        />
      )}
    </div>
  );
});
