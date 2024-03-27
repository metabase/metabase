import { forwardRef, isValidElement } from "react";

import CS from "metabase/css/core/index.css";
import { Icon } from "metabase/ui";

import type { BorderSide } from "./NotebookCell.styled";
import {
  NotebookCell as _NotebookCell,
  NotebookCellItemContainer,
  NotebookCellItemContentContainer,
  CONTAINER_PADDING,
} from "./NotebookCell.styled";

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
    ...restProps
  },
  ref,
) {
  const hasRightSide = isValidElement(right) && !readOnly;
  const mainContentRoundedCorners: BorderSide[] = ["left"];
  if (!hasRightSide) {
    mainContentRoundedCorners.push("right");
  }
  return (
    <NotebookCellItemContainer
      inactive={inactive}
      readOnly={readOnly}
      disabled={disabled}
      color={color}
      {...restProps}
      data-testid={restProps["data-testid"] ?? "notebook-cell-item"}
      ref={ref}
    >
      <NotebookCellItemContentContainer
        inactive={inactive}
        disabled={disabled}
        readOnly={readOnly}
        color={color}
        roundedCorners={mainContentRoundedCorners}
        style={containerStyle}
      >
        {children}
      </NotebookCellItemContentContainer>
      {hasRightSide && (
        <NotebookCellItemContentContainer
          inactive={inactive}
          color={color}
          border="left"
          roundedCorners={["right"]}
          style={rightContainerStyle}
        >
          {right}
        </NotebookCellItemContentContainer>
      )}
    </NotebookCellItemContainer>
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
