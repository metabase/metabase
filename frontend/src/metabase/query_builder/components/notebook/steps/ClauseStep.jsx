import React from "react";

import {
  NotebookCell,
  NotebookCellItem,
  NotebookCellAdd,
} from "../NotebookCell";

import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

export default function ClauseStep({
  color,
  items,
  renderName = item => item.displayName(),
  renderPopover,
  onRemove = null,
  isLastOpened = false,
  initialAddText = null,
  ...props
}) {
  return (
    <NotebookCell color={color}>
      {items.map((item, index) => (
        <PopoverWithTrigger
          triggerElement={
            <NotebookCellItem color={color}>
              {renderName(item, index)}
              {onRemove && (
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
        >
          {renderPopover(item, index)}
        </PopoverWithTrigger>
      ))}
      <PopoverWithTrigger
        triggerElement={
          <NotebookCellAdd
            color={color}
            initialAddText={items.length === 0 && initialAddText}
          />
        }
        isInitiallyOpen={isLastOpened}
      >
        {renderPopover()}
      </PopoverWithTrigger>
    </NotebookCell>
  );
}
