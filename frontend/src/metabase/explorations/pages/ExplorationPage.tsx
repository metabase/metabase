import { t } from "ttag";

import { useGetExplorationQuery } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { Box, Card, Group, Stack, Text } from "metabase/ui";

interface ExplorationPageProps {
  params: { id: string };
}

export function ExplorationPage({ params }: ExplorationPageProps) {
  const id = Number(params.id);
  const { data: exploration, isLoading, error } = useGetExplorationQuery(id);

  return (
    <LoadingAndErrorWrapper loading={isLoading} error={error}>
      {exploration && (
        <Box p="3rem" bg="background-secondary" mih="100%">
          <Stack maw="60rem" mx="auto" gap="lg">
            <Text size="xl" fw="bold">
              {exploration.name}
            </Text>
            {exploration.description && (
              <Text c="text-secondary">{exploration.description}</Text>
            )}
            {exploration.threads?.map((thread) => (
              <Stack key={thread.id} gap="md">
                {thread.prompt && (
                  <Text fs="italic" c="text-secondary">
                    {`"${thread.prompt}"`}
                  </Text>
                )}
                <Text fw="bold">{t`Generated charts`}</Text>
                {thread.queries && thread.queries.length > 0 ? (
                  <Stack gap="sm">
                    {thread.queries.map((q) => (
                      <Card key={q.id} withBorder>
                        <Group justify="space-between">
                          <Text fw="bold">
                            {q.name ?? t`Chart for metric ${q.card_id}`}
                          </Text>
                          <Text size="sm" c="text-secondary">
                            {q.dimension_ids.length === 0
                              ? t`No dimensions`
                              : t`Breakouts: ${q.dimension_ids.join(", ")}`}
                          </Text>
                        </Group>
                      </Card>
                    ))}
                  </Stack>
                ) : (
                  <Text c="text-secondary">{t`No charts were generated.`}</Text>
                )}
              </Stack>
            ))}
          </Stack>
        </Box>
      )}
    </LoadingAndErrorWrapper>
  );
}
