import type React from "react";
import { useMemo } from "react";

import { Box, Button, Flex } from "metabase/ui";

import type {
  DataAppWidget,
  DataAppWidgetButton,
  DataAppWidgetSection,
  WidgetId,
} from "../types";

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

  const rootSection = componentsMap.get("root") as DataAppWidgetSection;
  const RootSectionComponent = WIDGET_COMPONENTS_MAP[rootSection.type];

  const onComponentRender = (widget: DataAppWidget) => {
    const WidgetComponent = WIDGET_COMPONENTS_MAP[widget.type];

    return (
      <WidgetComponent
        key={widget.id}
        widget={widget}
        renderChildren={renderChildren}
      />
    );
  };

  const renderChildren = (childrenIds: WidgetId[]) => {
    return childrenIds.map((id) => {
      const widget = componentsMap.get(id);

      return onComponentRender(widget);
    });
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
        onComponentRender={onComponentRender}
      />
    </Box>
  );
};

const WIDGET_COMPONENTS_MAP = {
  section: ({
    widget,
    renderChildren,
  }: {
    widget: DataAppWidgetSection;
    renderChildren: (childrenIds: WidgetId[]) => React.ReactNode;
  }) => (
    <Flex
      data-section-id={widget.id}
      p="1rem"
      justify="stretch"
      style={{
        flexBasis: `${widget.options.width / 3}`,
        minWidth: "33%",
        border: "1px solid var(--mb-color-border)",
        // eslint-disable-next-line no-color-literals
        background: "rgba(0,0,0, 0.1)",
      }}
    >
      {renderChildren(widget.childrenIds)}
    </Flex>
  ),

  button: ({ widget }: { widget: DataAppWidgetButton }) => (
    <Button>{widget.options.text}</Button>
  ),
};
