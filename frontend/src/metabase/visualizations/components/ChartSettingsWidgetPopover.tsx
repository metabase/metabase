import React from "react";
import TippyPopover from "metabase/components/Popover/TippyPopover";
import ChartSettingsWidget from "./ChartSettingsWidget";

import { PopoverRoot, PopoverTitle } from "./ChartSettingsWidgetPopover.styled";

interface Widget {
  id: string;
  props: Record<string, unknown>;
}

interface ChartSettingsWidgetPopoverProps {
  anchor: HTMLElement;
  handleEndShowWidget: () => void;
  widgets: [Widget];
  currentWidget: Widget;
  extraWidgetProps: [];
}

export const ChartSettingsWidgetPopover = ({
  anchor,
  handleEndShowWidget,
  widgets,
  currentWidget,
  extraWidgetProps,
}: ChartSettingsWidgetPopoverProps) => {
  const popoverWidgets =
    currentWidget &&
    [widgets.find(widget => widget.id === currentWidget.id)]
      .map(widget => {
        if (widget) {
          return (
            <ChartSettingsWidget
              key={`${widget.id}`}
              {...widget}
              props={{
                ...(widget.props || {}),
                ...(currentWidget.props || {}),
              }}
              hidden={false}
              {...extraWidgetProps}
            />
          );
        }
      })
      .filter(w => !!w);

  return (
    <TippyPopover
      reference={anchor}
      content={
        <PopoverRoot>
          <PopoverTitle>Settings</PopoverTitle>
          {popoverWidgets}
        </PopoverRoot>
      }
      visible={!!anchor && popoverWidgets.length > 0}
      onClose={handleEndShowWidget}
      placement="right"
      offset={[10, 10]}
      popperOptions={{
        modifiers: [
          {
            name: "preventOverflow",
            options: {
              padding: 16,
            },
          },
        ],
      }}
    />
  );
};
