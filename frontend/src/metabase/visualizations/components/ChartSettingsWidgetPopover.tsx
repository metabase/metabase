import { useState, useRef, useEffect } from "react";
import _ from "underscore";

import TippyPopover from "metabase/components/Popover/TippyPopover";

import ChartSettingsWidget from "./ChartSettingsWidget";
import { PopoverRoot, PopoverTabs } from "./ChartSettingsWidgetPopover.styled";

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

  return (
    <TippyPopover
      reference={anchor}
      content={
        widgets.length > 0 ? (
          <PopoverRoot noTopPadding={hasMultipleSections} ref={contentRef}>
            {hasMultipleSections && (
              <PopoverTabs
                value={currentSection}
                options={sections.current.map((sectionName: string) => ({
                  name: sectionName,
                  value: sectionName,
                }))}
                onChange={section => setCurrentSection(String(section))}
                variant="underlined"
              />
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
          </PopoverRoot>
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

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidgetPopover;
