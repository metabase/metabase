import React, { useState, useMemo, useEffect } from "react";
import _ from "underscore";
import { t } from "ttag";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import Radio from "metabase/core/components/Radio";

import { PopoverRoot, PopoverTabs } from "./ChartSettingsWidgetPopover.styled";
import ChartSettingsWidget from "./ChartSettingsWidget";

interface Widget {
  id: string;
  props: Record<string, unknown>;
}

interface ChartSettingsWidgetPopoverProps {
  anchor: HTMLElement;
  handleEndShowWidget: () => void;
  widgets: Widget[];
  currentWidgetKey: string;
}

const ChartSettingsWidgetPopover = ({
  anchor,
  handleEndShowWidget,
  widgets,
  currentWidgetKey,
}: ChartSettingsWidgetPopoverProps) => {
  const sections = useMemo(() => {
    return _.groupBy(widgets, "section");
  }, [widgets]);

  const [currentSection, setCurrentSection] = useState<React.Key>("");
  const [widgetKey, setWidgetKey] = useState(currentWidgetKey);

  useEffect(() => {
    if (currentWidgetKey !== widgetKey) {
      setCurrentSection(Object.keys(sections)[0]);
      setWidgetKey(currentWidgetKey);
    }
  }, [currentWidgetKey, widgetKey, sections]);

  return (
    <TippyPopover
      reference={anchor}
      content={
        widgets.length > 0 ? (
          <PopoverRoot>
            <PopoverTabs
              value={currentSection}
              options={Object.keys(sections).map((sectionName: string) => ({
                name: sectionName,
                value: sectionName,
              }))}
              onChange={tab => setCurrentSection(tab)}
              variant="underlined"
            />
            {sections[currentSection]?.map(widget => (
              <ChartSettingsWidget key={widget.id} {...widget} hidden={false} />
            ))}
          </PopoverRoot>
        ) : null
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
