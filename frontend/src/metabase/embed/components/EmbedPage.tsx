import { Box, Text } from "metabase/ui";

export const EmbedPage = () => {
  return (
    <Box style={{ display: "flex", height: "100vh" }}>
      <Box
        style={{
          width: "300px",
          borderRight: "1px solid var(--mb-color-border)",
          padding: "1rem",
        }}
      >
        <Text size="xl" fw="bold" mb="md">Embed Settings</Text>
      </Box>
      <Box style={{ flex: 1, padding: "1rem" }}>
        <Text size="xl" fw="bold" mb="md">Embed Content</Text>
      </Box>
    </Box>
  );
};
