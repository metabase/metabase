/* eslint-disable react/prop-types */
import React from "react";

import Icon from "metabase/components/Icon";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

import {
  NotebookCell,
  NotebookCellItem,
  NotebookCellAdd,
} from "../NotebookCell";

export default function ClauseStep({
  color,
  items,
  renderName = item => item.displayName(),
  renderPopover,
  onRemove = null,
  canRemove,
  isLastOpened = false,
  initialAddText = null,
  tetherOptions = null,
  ...props
}) {
  return (
    <NotebookCell color={color}>
      {items.map((item, index) => (
        <PopoverWithTrigger
          tetherOptions={tetherOptions}
          key={index}
          triggerElement={
            <NotebookCellItem color={color}>
              {renderName(item, index)}
              {onRemove && (!canRemove || canRemove(item)) && (
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
    </NotebookCell>
  );
}
