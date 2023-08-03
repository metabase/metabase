import { Text } from "@mantine/core";

export const Playground = () => (
  <div style={{
    display: "flex",
    flexDirection: "column",
    gap: 10,
    padding: 20,
    backgroundColor: "#fff",
    borderRadius: 4,
    boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.1)",
  }}>
    <Text size="lg">
      “Having small touches of colour makes it more colourful than having the
      whole thing in colour”
    </Text>
    <Text size="md">
      “Having small touches of colour makes it more colourful than having the
      whole thing in colour”
    </Text>
    <Text size="sm">
      “Having small touches of colour makes it more colourful than having the
      whole thing in colour”
    </Text>
    <Text size="sm" fw={700}>
      “Having small touches of colour makes it more colourful than having the
      whole thing in colour”
    </Text>
    <Text size="xs">
      “Having small touches of colour makes it more colourful than having the
      whole thing in colour”
    </Text>
  </div>
);
