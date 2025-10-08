import { Badge, Box, Group, Stack, Text } from "metabase/ui";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useGetTransformQuery } from "metabase-enterprise/api";
import { skipToken } from "metabase/api";
import type { TransformId } from "metabase-types/api";

interface TransformDetailsProps {
  transformId?: TransformId;
}

export function TransformDetails({ transformId }: TransformDetailsProps) {
  const {
    data: transform,
    isLoading,
    error,
  } = useGetTransformQuery(transformId ?? skipToken);

  if (!transformId) {
    return (
      <Text size="sm" ta="center" py="md">
        Select a transform to view details
      </Text>
    );
  }

  if (isLoading || error) {
    return <LoadingAndErrorWrapper loading={isLoading} error={error} />;
  }

  if (!transform) {
    return (
      <Text size="sm" ta="center" py="md">
        Transform not found
      </Text>
    );
  }

  const getStatusColor = (status?: string) => {
    switch (status) {
      case "succeeded":
        return "green";
      case "failed":
        return "red";
      case "started":
      case "canceling":
        return "yellow";
      case "canceled":
        return "gray";
      default:
        return "gray";
    }
  };

  return (
    <Stack gap="md">
      <Box>
        <Text size="xs" fw={500} mb="xs">
          TRANSFORM NAME
        </Text>
        <Text size="sm" fw={500}>
          {transform.name}
        </Text>
      </Box>

      {transform.description && (
        <Box>
          <Text size="xs" fw={500} mb="xs">
            DESCRIPTION
          </Text>
          <Text size="sm">{transform.description}</Text>
        </Box>
      )}

      <Box>
        <Text size="xs" fw={500} mb="xs">
          TARGET TABLE
        </Text>
        <Text size="sm">
          {transform.target.schema ? `${transform.target.schema}.` : ""}
          {transform.target.name}
        </Text>
      </Box>

      {transform.last_run && (
        <Box>
          <Text size="xs" fw={500} mb="xs">
            LAST RUN STATUS
          </Text>
          <Group gap="xs">
            <Badge
              size="sm"
              color={getStatusColor(transform.last_run.status)}
              variant="light"
            >
              {transform.last_run.status}
            </Badge>
            {transform.last_run.end_time && (
              <Text size="xs">
                {new Date(transform.last_run.end_time).toLocaleString()}
              </Text>
            )}
          </Group>
          {transform.last_run.message && (
            <Text size="xs" mt="xs">
              {transform.last_run.message}
            </Text>
          )}
        </Box>
      )}

      <Box>
        <Text size="xs" fw={500} mb="xs">
          CREATED
        </Text>
        <Text size="sm">
          {new Date(transform.created_at).toLocaleDateString()}
        </Text>
      </Box>

      <Box>
        <Text size="xs" fw={500} mb="xs">
          LAST UPDATED
        </Text>
        <Text size="sm">
          {new Date(transform.updated_at).toLocaleDateString()}
        </Text>
      </Box>
    </Stack>
  );
}
