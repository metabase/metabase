import { ActionIcon, Box, Group, Icon } from "metabase/ui";
import { useMetabotAgent } from "metabase-enterprise/metabot/hooks"; // TODO: how to make this work in non-enterprise?

interface BenchToolbarProps {
  onSidebarToggle: () => void;
  isSidebarOpen: boolean;
}

export function BenchAppBar({
  onSidebarToggle,
  isSidebarOpen,
}: BenchToolbarProps) {
  const metabot = useMetabotAgent();

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
      </Group>

      {/* Search input - centered with max-width */}
      {/* <TextInput
        placeholder="Search..."
        leftSection={<Icon name="search" size={16} />}
        style={{
          flex: 1,
          maxWidth: "600px",
          margin: "0 16px",
        }}
      /> */}

      <Group gap="xs">
        <ActionIcon
          variant={metabot.visible ? "filled" : "subtle"}
          onClick={() => metabot.setVisible(!metabot.visible)}
        >
          <Icon name="metabot" />
        </ActionIcon>
      </Group>
    </Box>
  );
}
