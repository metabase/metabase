import { Box } from "metabase/ui";
import type { ContainerStyle } from "metabase-types/api";

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
  const [type, value] = containerStyle;

  if (type === "grid") {
    return createGridContainer(value);
  }

  if (type === "component") {
    return containers[value] ?? Box;
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
  return (
    <Box p="lg" bg="background-light" bdrs="md">
      {children}
    </Box>
  );
}
