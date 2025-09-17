import { Stack, Text, Paper, Button, Group } from "@mantine/core";
import { ColorSchemeToggle } from "metabase/ui";
import { useColorScheme } from "metabase/ui/components/theme/ColorSchemeProvider";

/**
 * Demo component to test dark mode functionality
 * Usage: Add this component to any page to test theme switching
 */
export function DarkModeDemo() {
  const { colorScheme, resolvedColorScheme } = useColorScheme();

  return (
    <Paper p="md" withBorder>
      <Stack gap="md">
        <Group justify="space-between">
          <Text size="lg" fw="bold">
            Dark Mode Demo
          </Text>
          <ColorSchemeToggle />
        </Group>

        <Text>
          Current setting: <strong>{colorScheme}</strong>
        </Text>

        <Text>
          Resolved scheme: <strong>{resolvedColorScheme}</strong>
        </Text>

        <Paper p="sm" style={{ backgroundColor: "var(--mb-color-bg-primary)" }}>
          <Text style={{ color: "var(--mb-color-text-primary)" }}>
            This text uses CSS variables that should change with theme
          </Text>
        </Paper>

        <Paper
          p="sm"
          style={{
            backgroundColor: "var(--mb-color-bg-secondary)",
            border: "1px solid var(--mb-color-border-primary)"
          }}
        >
          <Text style={{ color: "var(--mb-color-text-secondary)" }}>
            Secondary background and text colors
          </Text>
        </Paper>

        <Button variant="filled" color="brand">
          Brand color button (should stay consistent)
        </Button>
      </Stack>
    </Paper>
  );
}