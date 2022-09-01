import React from "react";
import { t } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";

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

const ChartSettingsWidgetPopover = ({
  anchor,
  handleEndShowWidget,
  widget,
}: ChartSettingsWidgetPopoverProps) => {
  return (
    <TippyPopover
      reference={anchor}
      content={
        <PopoverRoot>
          <PopoverTitle>{t`Settings`}</PopoverTitle>
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

export default ChartSettingsWidgetPopover;
