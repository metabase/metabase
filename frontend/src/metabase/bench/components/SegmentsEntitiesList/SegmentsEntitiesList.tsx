import { Box, NavLink, Text } from "metabase/ui";
import { Link } from "react-router";
import { useListSegmentsQuery } from "metabase/api/segment";
import { t } from "ttag";

interface SegmentsEntitiesListProps {
  selectedSegmentId?: number;
  onSegmentClick?: (segment: any) => void;
}

export function SegmentsEntitiesList({
  selectedSegmentId,
  onSegmentClick
}: SegmentsEntitiesListProps) {
  const { data: segments = [], isLoading, error } = useListSegmentsQuery();

  if (isLoading) {
    return (
      <Box p="lg">
        <Text size="sm" c="dimmed">{t`Loading segments...`}</Text>
      </Box>
    );
  }

  if (error) {
    return (
      <Box p="lg">
        <Text size="sm" c="error">{t`Error loading segments`}</Text>
      </Box>
    );
  }

  if (segments.length === 0) {
    return (
      <Box p="lg">
        <Text size="sm" c="dimmed">
          {t`No segments found. Create your first segment to get started.`}
        </Text>
      </Box>
    );
  }

  return (
    <Box>
      {segments.map((segment) => (
        <NavLink
          key={segment.id}
          component={Link}
          to={`/bench/segments/${segment.id}`}
          label={segment.name}
          active={selectedSegmentId === segment.id}
          px="lg"
          py="md"
          onClick={() => onSegmentClick?.(segment)}
        />
      ))}
    </Box>
  );
}
