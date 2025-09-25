import { Box, Text, Group, Button } from "metabase/ui";
import { Link } from "react-router";
import { t } from "ttag";

export function NewSegmentPage() {
  return (
    <Box>
      {/* New Segment Toolbar */}
      <Group justify="space-between" mb="md">
        <Box>
          <Text size="xl" fw="bold" mb="xs">
            {t`Create New Segment`}
          </Text>
          <Text size="sm" c="dimmed">
            {t`Define a new segment for your data`}
          </Text>
        </Box>
        <Group>
          <Button
            component={Link}
            to="/bench/segments"
            variant="outline"
          >
            {t`Cancel`}
          </Button>
        </Group>
      </Group>

      {/* New Segment Form */}
      <Box
        style={{
          backgroundColor: "var(--mb-color-bg-white)",
          border: "1px solid var(--mb-color-border)",
          borderRadius: "8px",
          padding: "24px",
        }}
      >
        <Text size="sm" c="dimmed" mb="md">
          {t`Segment creation form`}
        </Text>
        {/* TODO: Integrate existing segment form component here */}
        <Text size="sm" c="dimmed">
          {t`Segment form integration coming soon...`}
        </Text>
      </Box>
    </Box>
  );
}
