import React from "react";

import type Tether from "tether";
import { Icon } from "metabase/core/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";
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
  tetherOptions?: Tether.ITetherOptions | null;
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
  tetherOptions = null,
  readOnly,
  ...props
}: ClauseStepProps<T>): JSX.Element => {
  return (
    <NotebookCell color={color} data-testid={props["data-testid"]}>
      {items.map((item, index) => (
        <PopoverWithTrigger
          tetherOptions={tetherOptions}
          key={index}
          triggerElement={
            <NotebookCellItem color={color} readOnly={readOnly}>
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
          }
          sizeToFit
        >
          {renderPopover(item, index)}
        </PopoverWithTrigger>
      ))}
      {!readOnly && (
        <PopoverWithTrigger
          triggerElement={
            <NotebookCellAdd
              color={color}
              initialAddText={items.length === 0 && initialAddText}
            />
          }
          tetherOptions={tetherOptions}
          sizeToFit
          isInitiallyOpen={isLastOpened}
        >
          {renderPopover()}
        </PopoverWithTrigger>
      )}
    </NotebookCell>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ClauseStep;
