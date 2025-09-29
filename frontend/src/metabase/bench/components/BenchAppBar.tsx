import { ActionIcon, Box, Group, Icon, TextInput } from "metabase/ui";

interface BenchToolbarProps {
  onMetabotToggle: () => void;
  isMetabotOpen: boolean;
  onSidebarToggle: () => void;
  isSidebarOpen: boolean;
}

export function BenchAppBar({
  onMetabotToggle,
  isMetabotOpen,
  onSidebarToggle,
  isSidebarOpen,
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
        <ActionIcon onClick={onSidebarToggle}>
          <Icon name={isSidebarOpen ? "sidebar_open" : "sidebar_closed"} />
        </ActionIcon>
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

      <Group gap="xs">
        <ActionIcon
          variant={isMetabotOpen ? "filled" : "subtle"}
          onClick={onMetabotToggle}
        >
          <Icon name="insight" />
        </ActionIcon>
      </Group>
    </Box>
  );
}
