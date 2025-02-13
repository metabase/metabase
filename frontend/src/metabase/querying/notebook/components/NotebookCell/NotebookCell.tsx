import cx from "classnames";
import { type CSSProperties, forwardRef, isValidElement } from "react";

import CS from "metabase/css/core/index.css";
import { Flex, type FlexProps, Icon, rem } from "metabase/ui";

import S from "./NotebookCell.module.css";
import { CONTAINER_PADDING } from "./constants";

const _NotebookCell = ({ className, color, ...props }: FlexProps) => {
  return (
    <Flex
      className={cx(S.NotebookCell, className)}
      p={props.p ?? rem("14px")}
      c={color}
      {...props}
      style={
        {
          "--notebook-cell-color": color,
        } as CSSProperties
      }
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
}

export const NotebookCellItem = forwardRef<
  HTMLDivElement,
  NotebookCellItemProps
>(function NotebookCellItem(
  {
    inactive,
    disabled,
    color,
    containerStyle,
    right,
    rightContainerStyle,
    children,
    readOnly,
    className,
    ...restProps
  },
  ref,
) {
  const hasRightSide = isValidElement(right) && !readOnly;

  return (
    <Flex
      className={cx(
        S.NotebookCellItemContainer,
        {
          [S.inactive]: inactive,
          [S.disabled]: disabled,
          [S.cursorPointer]:
            (!inactive || restProps.onClick) && !readOnly && !disabled,
        },
        className,
      )}
      style={
        {
          "--notebook-cell-item-container-color": color,
        } as CSSProperties
      }
      {...restProps}
      data-testid={restProps["data-testid"] ?? "notebook-cell-item"}
      ref={ref}
    >
      <Flex
        className={cx(
          S.NotebookCellItemContentContainer,
          S.leftRoundedCorners,
          {
            [S.inactive]: inactive,
            [S.rightRoundedCorners]: !hasRightSide,
            [S.canHover]: !inactive && !readOnly && !disabled,
          },
        )}
        p={CONTAINER_PADDING}
        style={
          {
            ...containerStyle,
            "--notebook-cell-item-content-container-color": color,
          } as CSSProperties
        }
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
              [S.inactive]: inactive,
              [S.canHover]: !inactive && !readOnly && !disabled,
            },
          )}
          p={CONTAINER_PADDING}
          style={
            {
              ...rightContainerStyle,
              "--notebook-cell-item-content-container-color": color,
            } as CSSProperties
          }
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
      <NotebookCellItem {...props} inactive={!!initialAddText} ref={ref}>
        {initialAddText || <Icon name="add" className={CS.textWhite} />}
      </NotebookCellItem>
    );
  },
);
