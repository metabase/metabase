import { Box, Text, Group, Button, Divider } from "metabase/ui";
import { useGetSegmentQuery } from "metabase/api/segment";
import { t } from "ttag";
import { Link } from "react-router";

interface SegmentsDetailsProps {
  params: {
    segmentId: string;
  };
}

export function SegmentsDetails({ params }: SegmentsDetailsProps) {
  const segmentId = parseInt(params.segmentId, 10);
  const { data: segment, isLoading, error } = useGetSegmentQuery(segmentId);

  if (isLoading) {
    return (
      <Box>
        <Text size="sm">{t`Loading segment...`}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box>
        <Text size="sm" c="error">{t`Error loading segment`}</Text>
      </Box>
    );
  }

  if (!segment) {
    return (
      <Box>
        <Text size="sm">{t`Segment not found`}</Text>
      </Box>
    );
  }

  return (
    <Box>
      {/* Segment Toolbar */}
      <Group justify="space-between" mb="md">
        <Box>
          <Text size="xl" fw="bold" mb="xs">
            {segment.name}
          </Text>
          <Text size="sm" c="dimmed">
            {t`Segment definition`}
          </Text>
        </Box>
        <Group>
          <Button
            component={Link}
            to={`/bench/segments/${segment.id}/edit`}
            variant="outline"
          >
            {t`Edit`}
          </Button>
        </Group>
      </Group>

      <Divider mb="lg" />

      {/* Segment Content */}
      <Box>
        <Text size="lg" fw="bold" mb="md">
          {t`Definition`}
        </Text>

        {segment.description && (
          <Box mb="md">
            <Text size="sm" mb="xs">
              {t`Description`}
            </Text>
            <Text>{segment.description}</Text>
          </Box>
        )}

        <Box mb="md">
          <Text size="sm" mb="xs">
            {t`Table`}
          </Text>
          <Text>{segment.table?.display_name || segment.table?.name}</Text>
        </Box>

        {/* Query Builder Component - Keep existing implementation */}
        <Box
          style={{
            backgroundColor: "var(--mb-color-bg-white)",
            border: "1px solid var(--mb-color-border)",
            borderRadius: "8px",
            padding: "16px",
          }}
        >
          <Text size="sm" mb="md">
            {t`Segment filter definition`}
          </Text>
          {/* TODO: Integrate existing query builder component here */}
          <Text size="sm">
            {t`Query builder integration coming soon...`}
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
