import { useCallback, useMemo } from "react";
import { DndProvider } from "react-dnd";
import HTML5Backend from "react-dnd-html5-backend";

import { Box, Group } from "metabase/ui";
import { ComponentsSidebar } from "metabase-enterprise/data-apps/DataAppContainer";
import { WIDGET_COMPONENTS_MAP } from "metabase-enterprise/data-apps/canvas/widgets";
import type { SettingsSectionKey } from "metabase-enterprise/data-apps/types";

import { Container } from "./DndCanvas";
import type {
  DataAppWidget,
  HandleDropFnArguments,
  WidgetId,
} from "./canvas-types";

type DataAppWidgetsCanvasProps = {
  components: DataAppWidget[];
  onComponentsUpdate: (newComponents: DataAppWidget[]) => void;

  activeSettingsSection: SettingsSectionKey | undefined;
  setActiveSettingsSection: (newValue: SettingsSectionKey | undefined) => void;
};

// TODO: we should have non-editable canvas for viewing data apps
export const DataAppWidgetsCanvas = ({
  components,
  onComponentsUpdate,
  activeSettingsSection,
  setActiveSettingsSection,
}: DataAppWidgetsCanvasProps) => {
  const componentsMap = useMemo(() => {
    const map = new Map<WidgetId, DataAppWidget>();
    components.forEach((item) => map.set(item.id, item));
    return map;
  }, [components]);

  const renderCanvasComponent = useCallback(
    (id: WidgetId, handleDrop: (params: HandleDropFnArguments) => void) => {
      const widget = componentsMap.get(id);

      if (!widget) {
        // eslint-disable-next-line i18next/no-literal-string
        return <div>UNKNOWN ITEM: {id}</div>;
      }

      const WidgetComponent = WIDGET_COMPONENTS_MAP[widget.type];

      return (
        <WidgetComponent
          widget={widget}
          renderCanvasComponent={renderCanvasComponent}
          componentsMap={componentsMap}
          handleDrop={handleDrop}
        />
      );
    },
    [componentsMap],
  );

  return (
    // @ts-expect-error -- some issue with typings for react-dnd
    <DndProvider backend={HTML5Backend}>
      <Group
        bg="var(--mb-color-bg-light)"
        align="stretch"
        gap={0}
        style={{
          flexGrow: 1,
        }}
      >
        <Box
          style={{
            flexGrow: 1,
            backgroundImage:
              "radial-gradient(circle, var(--mb-color-border) 1px, transparent 0)",
            backgroundSize: "16px 16px",
            backgroundRepeat: "repeat",
          }}
        >
          <Container
            components={components}
            componentsMap={componentsMap}
            onComponentsUpdate={onComponentsUpdate}
            renderCanvasComponent={renderCanvasComponent}
          />
        </Box>

        {activeSettingsSection === "components" && (
          <ComponentsSidebar
            onClose={() => setActiveSettingsSection(undefined)}
          />
        )}
      </Group>
    </DndProvider>
  );
};
