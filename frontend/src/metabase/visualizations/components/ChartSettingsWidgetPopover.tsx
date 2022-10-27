import React, { useState, useRef, useEffect } from "react";
import _ from "underscore";
import TippyPopover from "metabase/components/Popover/TippyPopover";

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
  const sections = useRef<Record<React.Key, Widget[]>>({});

  useEffect(() => {
    sections.current = _.groupBy(widgets, "section");
  }, [widgets]);

  const [currentSection, setCurrentSection] = useState<React.Key>("");

  useEffect(() => {
    setCurrentSection(Object.keys(sections.current)[0]);
  }, [currentWidgetKey, sections]);

  const sectionNames = Object.keys(sections.current) || [];
  const hasMultipleSections = sectionNames.length > 1;

  return (
    <TippyPopover
      reference={anchor}
      content={
        widgets.length > 0 ? (
          <PopoverRoot noTopPadding={hasMultipleSections}>
            {hasMultipleSections && (
              <PopoverTabs
                value={currentSection}
                options={sectionNames.map((sectionName: string) => ({
                  name: sectionName,
                  value: sectionName,
                }))}
                onChange={setCurrentSection}
                variant="underlined"
              />
            )}
            {sections.current[currentSection]?.map(widget => (
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
