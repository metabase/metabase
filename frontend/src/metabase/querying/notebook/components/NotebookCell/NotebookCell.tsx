import cx from "classnames";
import { forwardRef, isValidElement } from "react";

import CS from "metabase/css/core/index.css";
import { Flex, type FlexProps, Icon, rem } from "metabase/ui";

import S from "./NotebookCell.module.css";
import { CONTAINER_PADDING } from "./constants";
import { getPillShadeVars, hasPillShades } from "./pill-shades";

const _NotebookCell = ({ className, color, ...props }: FlexProps) => {
  return (
    <Flex
      className={cx(S.NotebookCell, className)}
      p={props.p ?? rem("14px")}
      {...props}
      style={{
        "--notebook-cell-color": `var(--mb-color-${color})`,
      }}
    />
  );
};

export const NotebookCell = Object.assign(_NotebookCell, {
  displayName: "NotebookCell",
  CONTAINER_PADDING,
});

interface NotebookCellItemProps {
  color: string;
  inactive?: boolean;
  selected?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  right?: React.ReactNode;
  containerStyle?: React.CSSProperties;
  rightContainerStyle?: React.CSSProperties;
  children?: React.ReactNode;
  onClick?: React.MouseEventHandler;
  "data-testid"?: string;
  ref?: React.Ref<HTMLDivElement>;
  className?: string;
  hasPopover?: boolean;
}

export const NotebookCellItem = forwardRef<
  HTMLDivElement,
  NotebookCellItemProps
>(function NotebookCellItem(
  {
    inactive,
    selected,
    disabled,
    color,
    containerStyle,
    right,
    rightContainerStyle,
    children,
    readOnly,
    hasPopover,
    className,
    ...restProps
  },
  ref,
) {
  const hasRightSide = isValidElement(right) && !readOnly;
  // The summary and filter pills take the colors of the custom
  // expression design.
  const hasShades = hasPillShades(color) && !inactive;

  return (
    <Flex
      className={cx(
        S.NotebookCellItemContainer,
        {
          [S.selected]: selected,
          [S.inactive]: inactive,
          [S.disabled]: disabled,
          [S.cursorPointer]:
            (!inactive || restProps.onClick) &&
            !disabled &&
            (!readOnly || hasPopover),
        },
        className,
      )}
      style={{
        "--notebook-cell-item-container-color": `var(--mb-color-${color})`,
        ...(hasShades ? getPillShadeVars(color) : undefined),
      }}
      {...restProps}
      data-testid={restProps["data-testid"] ?? "notebook-cell-item"}
      ref={ref}
    >
      <Flex
        className={cx(
          S.NotebookCellItemContentContainer,
          S.leftRoundedCorners,
          {
            [S.selected]: selected,
            [S.inactive]: inactive,
            [S.shades]: hasShades,
            [S.rightRoundedCorners]: !hasRightSide,
            [S.canHover]: !inactive && !readOnly && !disabled,
          },
        )}
        style={{
          padding: CONTAINER_PADDING,
          ...containerStyle,
          "--notebook-cell-item-content-container-color": `var(--mb-color-${color})`,
        }}
      >
        {children}
      </Flex>
      {hasRightSide && (
        <Flex
          className={cx(
            S.NotebookCellItemContentContainer,
            S.rightRoundedCorners,
            S.leftBorder,
            {
              [S.selected]: selected,
              [S.inactive]: inactive,
              [S.shades]: hasShades,
              [S.canHover]: !inactive && !readOnly && !disabled,
            },
          )}
          style={{
            padding: CONTAINER_PADDING,
            ...rightContainerStyle,
            "--notebook-cell-item-content-container-color": `var(--mb-color-${color})`,
          }}
        >
          {right}
        </Flex>
      )}
    </Flex>
  );
});

interface NotebookCellAddProps extends NotebookCellItemProps {
  initialAddText?: React.ReactNode;
}

export const NotebookCellAdd = forwardRef<HTMLDivElement, NotebookCellAddProps>(
  function NotebookCellAdd({ initialAddText, ...props }, ref) {
    return (
      <NotebookCellItem
        {...props}
        className={cx(S.addButton, props.className)}
        inactive={!!initialAddText}
        ref={ref}
      >
        {initialAddText || <Icon name="add" className={CS.textWhite} />}
      </NotebookCellItem>
    );
  },
);
