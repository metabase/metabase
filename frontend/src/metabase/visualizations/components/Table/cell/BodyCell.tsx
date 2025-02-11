import cx from "classnames";
import {
  type HTMLAttributes,
  type MouseEventHandler,
  useCallback,
} from "react";

import CS from "metabase/css/core/index.css";
import { ExpandButton } from "metabase/visualizations/components/TableInteractive/TableInteractive.styled";

import type { CellFormatter, TextAlign } from "../types";

import { BaseCell } from "./BaseCell";
import S from "./BodyCell.module.css";

export type BodyCellProps<TValue> = {
  value: TValue;
  formatter?: CellFormatter<TValue>;
  backgroundColor?: string;
  align?: TextAlign;
  variant?: "text" | "pill";
  wrap?: boolean;
  canExpand?: boolean;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  onExpand?: () => void;
  contentAttributes?: HTMLAttributes<HTMLDivElement>;
};

export const BodyCell = function BodyCell<TValue>({
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
}: BodyCellProps<TValue>) {
  const formattedValue = formatter ? formatter(value) : String(value);

  const handleExpandClick: MouseEventHandler<HTMLButtonElement> = useCallback(
    e => {
      e.stopPropagation();
      onExpand?.();
    },
    [onExpand],
  );

  return (
    <BaseCell
      align={align}
      className={cx(S.root, CS.hoverParent, CS.hoverVisibility, {
        [S.clickable]: !!onClick,
        [S.pill]: variant === "pill",
      })}
      backgroundColor={backgroundColor}
    >
      <div
        data-grid-cell-content
        className={cx(S.content, {
          [S.noWrap]: !wrap,
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
    </BaseCell>
  );
};
