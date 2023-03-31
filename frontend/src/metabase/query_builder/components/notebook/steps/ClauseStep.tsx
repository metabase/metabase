import React from "react";

import Icon from "metabase/components/Icon";
import TippyPopoverWithTrigger from "metabase/components/PopoverWithTrigger/TippyPopoverWithTrigger";
import {
  NotebookCell,
  NotebookCellAdd,
  NotebookCellItem,
} from "../NotebookCell";

interface ClauseStepProps<T> {
  color: string;
  items: T[];
  renderName: (item: T, index: number) => JSX.Element | string;
  renderPopover: (item?: T, index?: number) => JSX.Element | null;
  canRemove?: (item: T) => boolean;
  isLastOpened?: boolean;
  onRemove?: ((item: T, index: number) => void) | null;
  initialAddText?: string | null;
  readOnly?: boolean;
  "data-testid"?: string;
}

const ClauseStep = <T,>({
  color,
  items,
  renderName,
  renderPopover,
  canRemove,
  onRemove = null,
  isLastOpened = false,
  initialAddText = null,
  readOnly,
  ...props
}: ClauseStepProps<T>): JSX.Element => {
  return (
    <NotebookCell color={color} data-testid={props["data-testid"]}>
      {items.map((item, index) => (
        <TippyPopoverWithTrigger
          key={index}
          sizeToFit
          renderTrigger={({ onClick }) => (
            <NotebookCellItem
              color={color}
              onClick={onClick}
              readOnly={readOnly}
            >
              {renderName(item, index)}
              {!readOnly && onRemove && (!canRemove || canRemove(item)) && (
                <Icon
                  ml={1}
                  name="close"
                  onClick={e => {
                    e.stopPropagation();
                    onRemove(item, index);
                  }}
                />
              )}
            </NotebookCellItem>
          )}
          popoverContent={renderPopover(item, index)}
        />
      ))}
      {!readOnly && (
        <TippyPopoverWithTrigger
          isInitiallyVisible={isLastOpened}
          sizeToFit
          renderTrigger={({ onClick }) => (
            <NotebookCellAdd
              color={color}
              initialAddText={items.length === 0 && initialAddText}
              onClick={onClick}
            />
          )}
          popoverContent={renderPopover()}
        />
      )}
    </NotebookCell>
  );
};

export default ClauseStep;
