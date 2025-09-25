import { ActionIcon, Box, Group, TextInput } from "metabase/ui";
import { Icon } from "metabase/ui";

interface BenchToolbarProps {
  onMetabotToggle: () => void;
  isMetabotOpen: boolean;
}

export function BenchToolbar({
  onMetabotToggle,
  isMetabotOpen,
}: BenchToolbarProps) {
  return (
    <Box
      style={{
        height: "48px",
        borderBottom: "1px solid var(--mb-color-border)",
        padding: "0 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      {/* Left navigation buttons */}
      <Group gap="xs">
        <ActionIcon variant="subtle" size="sm">
          <Icon name="chevronleft" />
        </ActionIcon>
        <ActionIcon variant="subtle" size="sm">
          <Icon name="chevronright" />
        </ActionIcon>
      </Group>

      {/* Search input - centered with max-width */}
      <TextInput
        placeholder="Search..."
        leftSection={<Icon name="search" size={16} />}
        style={{
          flex: 1,
          maxWidth: "600px",
          margin: "0 16px",
        }}
      />

      {/* Metabot toggle - far right */}
      <ActionIcon
        variant={isMetabotOpen ? "filled" : "subtle"}
        onClick={onMetabotToggle}
      >
        <Icon name="insight" />
      </ActionIcon>
    </Box>
  );
}
