import { Box } from "metabase/ui";
import type { ContainerStyle } from "metabase-types/api";

import S from "./container-styles.module.css";

function GridContainer({
  children,
  gridTemplateColumns,
}: {
  children: React.ReactNode;
  gridTemplateColumns: string;
}) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns,
        gap: "1rem",
      }}
    >
      {children}
    </Box>
  );
}

function createGridContainer(gridTemplateColumns: string) {
  const GridContainerWrapper = ({
    children,
  }: {
    children: React.ReactNode;
  }) => (
    <GridContainer gridTemplateColumns={gridTemplateColumns}>
      {children}
    </GridContainer>
  );

  return GridContainerWrapper;
}

export function getContainer(containerStyle: ContainerStyle) {
  if (Array.isArray(containerStyle)) {
    const [type, value] = containerStyle;

    if (type === "grid") {
      return createGridContainer(value);
    }

    if (type === "component") {
      // Look up component by name
      return containers[value] ?? Box;
    }
  }

  // Handle string format (backwards compatibility)
  if (typeof containerStyle === "string") {
    return containers[containerStyle] ?? Box;
  }

  return Box;
}

const containers: Record<
  string,
  React.ComponentType<{ children: React.ReactNode }>
> = {
  backdrop: Backdrop,
};

export function Backdrop({ children }: { children: React.ReactNode }) {
  return <div className={S.backdrop}>{children}</div>;
}
