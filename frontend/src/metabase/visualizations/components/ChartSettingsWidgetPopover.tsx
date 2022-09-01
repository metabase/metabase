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
  widget: Widget;
}

export const ChartSettingsWidgetPopover = ({
  anchor,
  handleEndShowWidget,
  widget,
}: ChartSettingsWidgetPopoverProps) => {
  return (
    <TippyPopover
      reference={anchor}
      content={
        <PopoverRoot>
          <PopoverTitle>Settings</PopoverTitle>
          {widget}
        </PopoverRoot>
      }
      visible={!!anchor}
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
