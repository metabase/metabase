import { Box } from "metabase/ui";
import type { ContainerStyle } from "metabase-types/api";

export function CustomContainer({
  children,
  containerStyle,
}: {
  children: React.ReactNode;
  containerStyle: ContainerStyle;
}) {
  const [type, value] = containerStyle;

  if (type === "grid") {
    return (
      <GridContainer gridTemplateColumns={value}>{children}</GridContainer>
    );
  }

  if (type === "component") {
    if (value === "backdrop") {
      return <Backdrop>{children}</Backdrop>;
    }
  }

  return <Box>{children}</Box>;
}

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

function Backdrop({ children }: { children: React.ReactNode }) {
  return (
    <Box p="lg" bg="background-light" bdrs="md">
      {children}
    </Box>
  );
}
