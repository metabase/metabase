import type React from "react";
import { useMemo } from "react";

import { Box } from "metabase/ui";
import { WIDGET_COMPONENTS_MAP } from "metabase-enterprise/data-apps/canvas/widgets";

import type { DataAppWidget, WidgetId } from "../types";

import { DndCanvas } from "./DndCanvas";

type DataAppWidgetsCanvasProps = {
  components: DataAppWidget[];
  onComponentsUpdate: (newComponents: DataAppWidget[]) => void;
};

// TODO: we should have non-editable canvas for viewing data apps
export const DataAppWidgetsCanvas = ({
  components,
  onComponentsUpdate,
}: DataAppWidgetsCanvasProps) => {
  const componentsMap = useMemo(() => {
    const map = new Map();
    components.forEach((item) => map.set(item.id, item));
    return map;
  }, [components]);

  // const rootSection = componentsMap.get("root");

  const renderCanvasComponent = (id: WidgetId) => {
    const widget = componentsMap.get(id);

    if (!widget) {
      return <div>UNKNOWN ITEM: {id}</div>;
    }

    const WidgetComponent = WIDGET_COMPONENTS_MAP[widget.type];

    return (
      <WidgetComponent
        widget={widget}
        renderCanvasComponent={renderCanvasComponent}
      />
    );
  };

  return (
    <Box
      style={{
        flexGrow: 1,
        backgroundImage:
          "radial-gradient(circle, var(--mb-color-border) 1px, transparent 0)",
        backgroundSize: "16px 16px",
        backgroundRepeat: "repeat",
      }}
    >
      {/*<RootSectionComponent*/}
      {/*  widget={rootSection}*/}
      {/*  renderChildren={renderChildren}*/}
      {/*/>*/}

      <DndCanvas
        components={components}
        onComponentsUpdate={onComponentsUpdate}
        renderCanvasComponent={renderCanvasComponent}
      />
    </Box>
  );
};
