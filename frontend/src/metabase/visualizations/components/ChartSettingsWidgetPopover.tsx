import { useEffect, useRef, useState } from "react";
import _ from "underscore";

import ChartSettingsWidget from "./ChartSettingsWidget";
import { PopoverRoot, PopoverTabs } from "./ChartSettingsWidgetPopover.styled";

interface Widget {
  id: string;
  section: string;
  props: Record<string, unknown>;
}

interface ChartSettingsWidgetPopoverProps {
  handleEndShowWidget: () => void;
  widgets: Widget[];
}

const ChartSettingsWidgetPopover = ({
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
  }, [sections]);

  const hasMultipleSections = sections.current.length > 1;

  return widgets.length > 0 ? (
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
          <ChartSettingsWidget key={widget.id} {...widget} hidden={false} />
        ))}
    </PopoverRoot>
  ) : null;
  // <TippyPopover
  //   reference={anchor}
  //   content={
  //
  //   }
  //   visible={!!anchor}
  //   onClose={onClose}
  //   placement="right"
  //   offset={[10, 10]}
  //   popperOptions={{
  //     modifiers: [
  //       {
  //         name: "preventOverflow",
  //         options: {
  //           padding: 16,
  //         },
  //       },
  //     ],
  //   }}
  // />
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default ChartSettingsWidgetPopover;
