import { useEffect, useRef, useState } from "react";
import _ from "underscore";

import { Box, Popover, Stack, Tabs } from "metabase/ui";

import ChartSettingsWidget from "./ChartSettingsWidget";
interface Widget {
  id: string;
  section: string;
  props: Record<string, unknown>;
}

interface ChartSettingsWidgetPopoverProps {
  anchor?: HTMLElement;
  handleEndShowWidget: () => void;
  widgets: Widget[];
}

const ChartSettingsWidgetPopover = ({
  anchor,
  handleEndShowWidget,
  widgets,
}: ChartSettingsWidgetPopoverProps) => {
  const sections = useRef<string[]>([]);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    sections.current = _.chain(widgets).pluck("section").unique().value();
  }, [widgets]);

  const [currentSection, setCurrentSection] = useState("");

  useEffect(() => {
    setCurrentSection(sections.current[0]);
  }, [anchor, sections]);

  const hasMultipleSections = sections.current.length > 1;

  const onClose = () => {
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && contentRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
    handleEndShowWidget();
  };

  const rect = anchor?.getBoundingClientRect();

  return (
    <Popover opened={!!anchor} onClose={onClose} position="right">
      <Popover.Target>
        <Box
          pos="fixed"
          left={rect?.left}
          top={rect?.top}
          w={anchor?.offsetWidth}
          h={anchor?.offsetHeight}
          style={{
            pointerEvents: "none",
          }}
        />
      </Popover.Target>
      <Popover.Dropdown miw="20rem">
        {widgets.length > 0 ? (
          <Stack p="sm">
            {hasMultipleSections && (
              <Tabs
                value={currentSection}
                onTabChange={section => setCurrentSection(String(section))}
              >
                <Tabs.List grow>
                  {sections.current.map(sectionName => (
                    <Tabs.Tab key={sectionName} value={sectionName}>
                      {sectionName}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            )}

            {widgets
              .filter(widget => widget.section === currentSection)
              ?.map(widget => (
                <ChartSettingsWidget
                  key={widget.id}
                  {...widget}
                  hidden={false}
                />
              ))}
          </Stack>
        ) : null}
      </Popover.Dropdown>
    </Popover>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidgetPopover;
