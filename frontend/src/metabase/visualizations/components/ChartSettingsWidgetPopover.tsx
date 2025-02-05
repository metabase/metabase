import { useEffect, useRef, useState } from "react";
import _ from "underscore";

import TippyPopover from "metabase/components/Popover/TippyPopover";
import CS from "metabase/css/core/index.css";
import { Box, Space, Tabs } from "metabase/ui";

import ChartSettingsWidget from "./ChartSettingsWidget";

interface Widget {
  id: string;
  section: string;
  props: Record<string, unknown>;
}

interface ChartSettingsWidgetPopoverProps {
  anchor: HTMLElement;
  handleEndShowWidget: () => void;
  widgets: Widget[];
}

export const ChartSettingsWidgetPopover = ({
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

  return (
    <TippyPopover
      reference={anchor}
      content={
        widgets.length > 0 ? (
          <Box
            pt={hasMultipleSections ? 0 : undefined}
            ref={contentRef}
            mah="37.5rem"
            miw="336px"
            className={CS.overflowYAuto}
          >
            {hasMultipleSections && (
              <Tabs
                px="md"
                pt="xs"
                value={currentSection}
                onTabChange={section => setCurrentSection(String(section))}
              >
                <Tabs.List grow>
                  {sections.current.map(sectionName => (
                    <Tabs.Tab key={sectionName} value={sectionName} p="md">
                      {sectionName}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            )}
            <Space py="sm"></Space>
            {widgets
              .filter(widget => widget.section === currentSection)
              ?.map(widget => (
                <ChartSettingsWidget
                  key={widget.id}
                  {...widget}
                  hidden={false}
                />
              ))}
          </Box>
        ) : null
      }
      visible={!!anchor}
      onClose={onClose}
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
