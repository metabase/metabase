import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import _ from "underscore";

import CS from "metabase/css/core/index.css";
import { isEmbeddingSdk } from "metabase/embedding-sdk/config";
import { Box, Space, Tabs } from "metabase/ui";
import { PopoverWithRef } from "metabase/ui/components/overlays/Popover/PopoverWithRef";

import type { Widget } from "../types";

import ChartSettingsWidget from "./ChartSettingsWidget";
import { WidgetPopoverPortalContext } from "./settings/WidgetPopoverPortalContext";

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
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [dropdownTarget, setDropdownTarget] = useState<HTMLDivElement | null>(
    null,
  );
  const [scrollContainer, setScrollContainer] = useState<HTMLDivElement | null>(
    null,
  );

  const setContentRef = useCallback((node: HTMLDivElement | null) => {
    contentRef.current = node;
    setScrollContainer(node);
  }, []);

  const portalValue = useMemo(
    () =>
      dropdownTarget && scrollContainer
        ? { dropdownTarget, scrollContainer }
        : null,
    [dropdownTarget, scrollContainer],
  );

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
    if (activeElement && contentRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
    handleEndShowWidget();
  };

  return (
    <PopoverWithRef
      anchorEl={anchor}
      opened={!!anchor && widgets.length > 0}
      onDismiss={onClose}
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
            ref={setContentRef}
            data-testid="chart-settings-widget-popover-content"
            mah="40rem"
            miw="336px"
            className={CS.overflowYAuto}
          >
            {hasMultipleSections && (
              <Tabs
                px="md"
                pt="xs"
                value={currentSection}
                onChange={(section) => setCurrentSection(String(section))}
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
