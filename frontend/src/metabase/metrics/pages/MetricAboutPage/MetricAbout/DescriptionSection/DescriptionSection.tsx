import { t } from "ttag";

import {
  useGetDatabaseQuery,
  useGetTableQuery,
  useUpdateCardMutation,
} from "metabase/api";
import { DateTime } from "metabase/common/components/DateTime";
import { EditableText } from "metabase/common/components/EditableText";
import { Link } from "metabase/common/components/Link/Link";
import { Markdown } from "metabase/common/components/Markdown";
import { useMetadataToasts } from "metabase/metadata/hooks";
import { PLUGIN_DEPENDENCIES } from "metabase/plugins";
import { Box, Card, Flex, Group, Icon, Stack, Text, rem } from "metabase/ui";
import { getUserName } from "metabase/utils/user";
import type { Card as CardApiType, CardType } from "metabase-types/api";

import type { MetricUrls } from "../../../../types";

import S from "./DescriptionSection.module.css";

interface DescriptionSectionProps {
  card: CardApiType;
  urls: MetricUrls;
}

export function DescriptionSection({ card, urls }: DescriptionSectionProps) {
  const [updateCard] = useUpdateCardMutation();
  const { sendSuccessToast, sendErrorToast } = useMetadataToasts();

  const isDependenciesEnabled = PLUGIN_DEPENDENCIES.isEnabled;

  const { data: database } = useGetDatabaseQuery(
    { id: card.database_id! },
    { skip: !card.database_id },
  );

  const { data: table } = useGetTableQuery(
    { id: card.table_id! },
    { skip: !card.table_id },
  );

  const { dependentsCount, dependenciesCount } =
    PLUGIN_DEPENDENCIES.useGetDependenciesCount({
      id: Number(card.id),
      type: "card",
    });

  const handleChange = async (newValue: string) => {
    const newDescription = newValue.trim();
    const { error } = await updateCard({
      id: card.id,
      description: newDescription.length > 0 ? newDescription : null,
    });
    if (error) {
      sendErrorToast(getErrorMessage(card.type));
    } else {
      sendSuccessToast(getSuccessMessage(card.type));
    }
  };

  const databaseUrl = database && urls.database?.(database.id);

  return (
    <Stack gap={0} align="stretch" data-testid="metric-description-sidebar">
      <Box data-testid="metric-description-section" p={rem(20)}>
        {card.can_write ? (
          <EditableText
            initialValue={card.description ?? ""}
            placeholder={t`No description`}
            isMarkdown
            isOptional
            isMultiline
            onChange={handleChange}
            px={0}
          />
        ) : (
          <Markdown>{card.description || t`No description`}</Markdown>
        )}
      </Box>

      <Card mx="lg" bg="background-secondary" shadow="none" radius="1rem">
        <Card.Section withBorder p="md">
          <Group gap="sm" mb={4}>
            <Icon name="pencil" c="brand" />
            <Text size="md" fw={600} lh="1rem">
              <DateTime value={card.updated_at} />
            </Text>
          </Group>
          <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
            {card["last-edit-info"]
              ? t`Last edited by ${getUserName(card["last-edit-info"])}`
              : t`Last edited at`}
          </Text>
        </Card.Section>
        {database && (
          <Card.Section withBorder p="md">
            <Group gap="sm" mb={4}>
              <Icon name="database" c="brand" />
              {databaseUrl ? (
                <Link to={databaseUrl} className={S.metricLink}>
                  <Text size="md" fw={600} lh="1rem">
                    {database.name}
                  </Text>
                </Link>
              ) : (
                <Text size="md" fw={600} lh="1rem">
                  {database.name}
                </Text>
              )}
            </Group>
            <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
              {t`Database`}
            </Text>
          </Card.Section>
        )}
        {table && (
          <Card.Section withBorder p="md">
            <Group gap="sm" mb={4}>
              <Icon name="table" c="brand" />
              <Text size="md" fw={600} lh="1rem">
                {table.display_name || table.name}
              </Text>
            </Group>
            <Text size="sm" c="text-secondary" lh="1rem" ml="1.5rem">
              {t`Source table`}
            </Text>
          </Card.Section>
        )}
      </Card>

      {isDependenciesEnabled && (
        <Card mx="lg" my="lg" shadow="none">
          <Card.Section withBorder py={rem(12)} px="md">
            <Flex justify="space-between" align="center">
              <Text size="md" c="text-secondary">
                {t`Dependencies`}
              </Text>
              {dependenciesCount > 0 ? (
                <Link to={urls.dependencies(card.id)} className={S.metricLink}>
                  <Text size="xl" fw={600}>
                    {dependenciesCount}
                  </Text>
                </Link>
              ) : (
                <Text size="xl" fw={600}>
                  {dependenciesCount}
                </Text>
              )}
            </Flex>
          </Card.Section>
          <Card.Section withBorder py={rem(12)} px="md">
            <Flex justify="space-between" align="center">
              <Text size="md" c="text-secondary">
                {t`Dependents`}
              </Text>

              {dependentsCount > 0 ? (
                <Link to={urls.dependencies(card.id)} className={S.metricLink}>
                  <Text size="xl" fw={600}>
                    {dependentsCount}
                  </Text>
                </Link>
              ) : (
                <Text size="xl" fw={600}>
                  {dependentsCount}
                </Text>
              )}
            </Flex>
          </Card.Section>
        </Card>
      )}
    </Stack>
  );
}

function getSuccessMessage(cardType: CardType) {
  switch (cardType) {
    case "question":
      return t`Question description updated`;
    case "model":
      return t`Model description updated`;
    case "metric":
      return t`Metric description updated`;
  }
}

function getErrorMessage(cardType: CardType) {
  switch (cardType) {
    case "question":
      return t`Failed to update question description`;
    case "model":
      return t`Failed to update model description`;
    case "metric":
      return t`Failed to update metric description`;
  }
}
