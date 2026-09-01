import { useEffect, useRef, useState } from "react";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { Box, Space, Tabs } from "metabase/ui";
import { PopoverWithRef } from "metabase/ui/components/overlays/Popover/PopoverWithRef";
import type { Widget } from "metabase/viz-core";

import ChartSettingsWidget from "./ChartSettingsWidget";
import {
  WidgetPopoverPortalContext,
  useWidgetPopoverPortal,
} from "./settings/WidgetPopoverPortalContext";

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
  const sections = useRef<(string | undefined)[]>([]);
  const {
    value: portalValue,
    setDropdownTarget,
    setScrollContainer,
    scrollContainer,
  } = useWidgetPopoverPortal();

  useEffect(() => {
    sections.current = _.chain(widgets).pluck("section").unique().value();
  }, [widgets]);

  const [currentSection, setCurrentSection] = useState<string | undefined>("");

  useEffect(() => {
    setCurrentSection(sections.current[0]);
  }, [anchor, sections]);

  const hasMultipleSections = sections.current.length > 1;

  const onClose = () => {
    // Unjustified type cast. FIXME
    const activeElement = document.activeElement as HTMLElement;
    if (activeElement && scrollContainer?.contains(activeElement)) {
      activeElement.blur();
    }
    handleEndShowWidget();
  };

  return (
    <PopoverWithRef
      anchorEl={anchor}
      opened={!!anchor && widgets.length > 0}
      onDismiss={onClose}
      closeOnEscape={false}
      position="right"
      offset={{ mainAxis: 10, crossAxis: 10 }}
      middlewares={{
        shift: { padding: 16 },
        flip: { fallbackStrategy: "initialPlacement" },
        size: { padding: 5 },
      }}
      styles={{ dropdown: { overflow: "visible" } }}
      {...(isEmbeddingSdk() && {
        withinPortal: false,
        floatingStrategy: "fixed",
      })}
    >
      <Box ref={setDropdownTarget}>
        <WidgetPopoverPortalContext.Provider value={portalValue}>
          <Box
            pt={hasMultipleSections ? 0 : undefined}
            ref={setScrollContainer}
            data-testid="chart-settings-widget-popover-content"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                // Escape bubbles here after a focused *BlurChange input has
                // discarded its pending value via flushSync; Mantine's document-level
                // closeOnEscape would unmount the widget before the input could react.
                onClose();
              }
            }}
            mah="40rem"
            miw="336px"
            className={CS.overflowYAuto}
          >
            {hasMultipleSections && (
              <Tabs
                px="md"
                pt="xs"
                value={currentSection}
                onChange={(section) => setCurrentSection(section ?? undefined)}
              >
                <Tabs.List grow>
                  {sections.current.map((sectionName) => (
                    <Tabs.Tab
                      key={sectionName}
                      value={String(sectionName)}
                      p="md"
                    >
                      {sectionName}
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs>
            )}
            <Space py="sm"></Space>
            {widgets
              .filter((widget) => widget.section === currentSection)
              ?.map((widget) => (
                <ChartSettingsWidget
                  key={widget.id}
                  {...widget}
                  hidden={false}
                />
              ))}
          </Box>
        </WidgetPopoverPortalContext.Provider>
      </Box>
    </PopoverWithRef>
  );
};
