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

// Cache for container components to prevent remounting on rerenders
const containerCache = new Map<
  string,
  React.ComponentType<{ children: React.ReactNode }>
>();

function getCacheKey(containerStyle: ContainerStyle): string {
  if (typeof containerStyle === "string") {
    return containerStyle;
  }
  const [type, value] = containerStyle;
  return `${type}:${value}`;
}

export function getContainer(containerStyle: ContainerStyle) {
  const cacheKey = getCacheKey(containerStyle);

  // Return cached component if it exists
  if (containerCache.has(cacheKey)) {
    return containerCache.get(cacheKey)!;
  }

  let Container: React.ComponentType<{ children: React.ReactNode }>;

  if (typeof containerStyle === "string") {
    Container = Box;
  } else {
    const [type, value] = containerStyle;

    if (type === "grid") {
      Container = createGridContainer(value);
    } else if (type === "component") {
      Container = containers[value] ?? Box;
    } else {
      Container = Box;
    }
  }

  // Cache the component for future use
  containerCache.set(cacheKey, Container);
  return Container;
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
