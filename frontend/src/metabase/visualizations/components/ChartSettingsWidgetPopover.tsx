import React, { useState } from "react";
import { t } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import Radio from "metabase/core/components/Radio";

import { PopoverRoot, PopoverTabs } from "./ChartSettingsWidgetPopover.styled";

interface Widget {
  id: string;
  props: Record<string, unknown>;
}

interface ChartSettingsWidgetPopoverProps {
  anchor: HTMLElement;
  handleEndShowWidget: () => void;
  formattingWidget: Widget;
  styleWidget: Widget;
}

const ChartSettingsWidgetPopover = ({
  anchor,
  handleEndShowWidget,
  formattingWidget,
  styleWidget,
}: ChartSettingsWidgetPopoverProps) => {
  const TABS = [
    styleWidget && "style",
    formattingWidget && "formatting",
  ].filter(x => !!x);
  const [currentTab, setCurrentTab] = useState(TABS[0]);

  return (
    <TippyPopover
      reference={anchor}
      content={
        <PopoverRoot>
          <PopoverTabs
            value={currentTab}
            options={TABS.map(t => ({ name: t, value: t }))}
            onChange={tab => setCurrentTab(tab)}
            variant="underlined"
          />
          {currentTab === "formatting" && formattingWidget}
          {currentTab === "style" && styleWidget}
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
