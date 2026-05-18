import { useDisclosure } from "@mantine/hooks";
import { P, match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import {
  Accordion,
  Alert,
  Box,
  Card,
  Flex,
  Icon,
  type MantineStyleProps,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Tooltip,
  UnstyledButton,
} from "metabase/ui";
import type { MetabaseColorKey } from "metabase/ui/colors/types";
import { formatNumber } from "metabase/utils/formatting";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useGetDataComplexityScoresQuery } from "../../api";
import type {
  DataComplexityCatalog,
  DataComplexityCatalogId,
  DataComplexityComponentId,
  DataComplexityFailure,
  DataComplexityGroupId,
  DataComplexityRating,
  DataComplexitySubScore,
  ScoreAndRating,
  ScoreAndRatingError,
} from "../../types";

const CATALOG_IDS: DataComplexityCatalogId[] = [
  "library",
  "universe",
  "metabot",
];

const GROUP_IDS = [
  "size",
  "ambiguity",
] as const satisfies readonly DataComplexityGroupId[];

function DataComplexityCardSkeleton() {
  return (
    <Card withBorder shadow="none" p="md">
      <Box my={5} w="70%">
        <Skeleton h={14} />
      </Box>
      <Box my={5} w="40%">
        <Skeleton h={14} />
      </Box>
      <Stack align="center" gap={0} my="sm">
        <Skeleton h="4rem" w="30%" />
      </Stack>
    </Card>
  );
}

function DataComplexityCard({
  catalogId,
  catalog,
}: {
  catalogId: DataComplexityCatalogId;
  catalog: DataComplexityCatalog;
}) {
  const [isModalOpen, { close, open }] = useDisclosure();
  const { subtitle, title } = match(catalogId)
    .with("library", () => ({
      title: t`Curated semantic layer`,
      subtitle: t`Metrics and published tables within your Library.`,
    }))
    .with("universe", () => ({
      title: t`Full semantic layer`,
      subtitle: t`Library entities plus every active physical table.`,
    }))
    .with("metabot", () => ({
      title: t`Metabot-visible layer`,
      subtitle: t`The subset the internal Metabot can surface with its current scope.`,
    }))
    .exhaustive();

  return (
    <Card withBorder shadow="none" p="md">
      <UnstyledButton onClick={open}>
        <Flex align="center" justify="space-between" gap="sm">
          <Text fw={700}>{title}</Text>
          <Icon name="expand" c="text-tertiary" />
        </Flex>
        <Text c="text-secondary">{subtitle}</Text>
        {match(catalog)
          .with({ score: P.number }, ({ score, rating, rating_label }) => (
            <Stack align="center" gap="sm" my="sm">
              <Text size="4rem" fw={700} c={ratingToTextColor(rating)}>
                {formatNumber(score, { maximumFractionDigits: 0 })}
              </Text>
              <Text c="text-secondary">{rating_label}</Text>
            </Stack>
          ))
          .otherwise(() => (
            <Stack gap={4} my="sm">
              <Text c="error" fw={700}>{t`Score unavailable`}</Text>
              <Text c="text-secondary">{t`Open for component details.`}</Text>
            </Stack>
          ))}
      </UnstyledButton>

      <Modal
        opened={isModalOpen}
        onClose={close}
        title={
          <Stack gap={4} align="flex-start">
            <Text fw={700} size="xl" lh="1.5rem">
              {title}
            </Text>
            <Text size="sm" lh="1rem" c="text-secondary">
              {subtitle}
            </Text>
          </Stack>
        }
      >
        <DataComplexityBreakdown catalog={catalog} />
      </Modal>
    </Card>
  );
}

function DataComplexityBreakdown({
  catalog,
}: {
  catalog: DataComplexityCatalog;
}) {
  const hasError = catalog.score == null;

  return (
    <Stack gap="lg" mt="md">
      {hasError && (
        <Alert color="warning" icon={<Icon name="warning" />}>
          {t`Some component scores could not be computed.`}
        </Alert>
      )}

      {GROUP_IDS.map((groupId) => {
        const title = match(groupId)
          .with("size", () => t`Size of this layer`)
          .with("ambiguity", () => t`Areas of ambiguity`)
          .exhaustive();
        const group = catalog.components[groupId];

        return (
          <Stack key={groupId} gap="md" w="100%">
            <Flex align="center" justify="space-between" gap="lg">
              <Text fw={700} lh="1rem">
                {title}
              </Text>
              <ScoreDisplayInline score={group} mr="2.75rem" />
            </Flex>

            <Accordion
              chevron={<Icon name="chevrondown" size={12} />}
              styles={{
                chevron: {
                  border: 0,
                  color: "var(--mb-color-text-primary)",
                  height: "0.75rem",
                  marginLeft: "1rem",
                  width: "0.75rem",
                },
                content: {
                  backgroundColor: "var(--mb-color-background-secondary)",
                  borderTop: "1px solid var(--mb-color-border-subtle)",
                  padding: "0.5rem 1rem 0.75rem",
                },
                control: {
                  backgroundColor: "var(--mb-color-background-secondary)",
                  borderRadius: "0.5rem",
                  padding: "0.625rem 1rem",
                },
                item: {
                  border: 0,
                  borderRadius: "0.5rem",
                  overflow: "hidden",
                },
                label: {
                  padding: 0,
                },
                root: {
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.25rem",
                  width: "100%",
                },
              }}
            >
              {getGroupComponentEntries(catalog, groupId).map(
                ([componentId, component]) => (
                  <DataComplexityComponentItem
                    key={componentId}
                    componentId={componentId}
                    component={component}
                  />
                ),
              )}
            </Accordion>
          </Stack>
        );
      })}
    </Stack>
  );
}

function getGroupComponentEntries(
  catalog: DataComplexityCatalog,
  groupId: DataComplexityGroupId,
): [DataComplexityComponentId, DataComplexitySubScore][] {
  return match(groupId)
    .returnType<[DataComplexityComponentId, DataComplexitySubScore][]>()
    .with("size", () =>
      (["entity_count", "field_count"] as const).map((componentId) => [
        componentId,
        catalog.components.size.components[componentId],
      ]),
    )
    .with("ambiguity", () =>
      (["name_collisions", "synonym_pairs", "repeated_measures"] as const).map(
        (componentId) => [
          componentId,
          catalog.components.ambiguity.components[componentId],
        ],
      ),
    )
    .exhaustive();
}

function DataComplexityComponentItem({
  componentId,
  component,
}: {
  componentId: DataComplexityComponentId;
  component: DataComplexitySubScore;
}) {
  const measurement = "measurement" in component ? component.measurement : null;
  const { count, description } = match(componentId)
    .with("entity_count", () => ({
      count:
        measurement === null
          ? t`Entities`
          : ngettext(
              msgid`${measurement} entity`,
              `${measurement} entities`,
              measurement,
            ),
      description: t`How many tables, models, and metrics are included in this layer.`,
    }))
    .with("name_collisions", () => ({
      count:
        measurement === null
          ? t`Duplicate names`
          : ngettext(
              msgid`${measurement} duplicate name`,
              `${measurement} duplicate names`,
              measurement,
            ),
      description: t`Exact duplicate names after normalization, which can make entities harder to distinguish.`,
    }))
    .with("synonym_pairs", () => ({
      count:
        measurement === null
          ? t`Semantically similar pairs`
          : ngettext(
              msgid`${measurement} semantically similar pair`,
              `${measurement} semantically similar pairs`,
              measurement,
            ),
      description: t`Pairs of entity names that are semantically similar enough to be treated as possible synonyms.`,
    }))
    .with("field_count", () => ({
      count:
        measurement === null
          ? t`Fields`
          : ngettext(
              msgid`${measurement} field`,
              `${measurement} fields`,
              measurement,
            ),
      description: t`Active physical-table fields exposed through this layer.`,
    }))
    .with("repeated_measures", () => ({
      count:
        measurement === null
          ? t`Duplicate measure names`
          : ngettext(
              msgid`${measurement} duplicate measure name`,
              `${measurement} duplicate measure names`,
              measurement,
            ),
      description: t`Duplicate measure names across included tables.`,
    }))
    .exhaustive();

  return (
    <Accordion.Item value={componentId} bg="background-secondary" bd="0" mt={0}>
      <Accordion.Control>
        <Flex align="center" gap="sm" w="100%">
          <Text c="text-primary" fw={500} truncate>
            {count}
          </Text>
          <Tooltip label={description}>
            <Icon name="info" c="text-tertiary" size={14} />
          </Tooltip>
          <ScoreDisplayInline score={component} />
        </Flex>
      </Accordion.Control>
      <Accordion.Panel>
        <Text size="sm" c="text-secondary">
          {description}
        </Text>
        {match(component)
          .with({ error: P.nonNullable }, ({ error }) => (
            <Text c="error" size="sm" role="alert">
              {error}
            </Text>
          ))
          .with({ rating_label: P.nonNullable }, ({ rating_label }) => (
            <Text size="sm" c="text-secondary">
              {rating_label}
            </Text>
          ))
          .otherwise(() => null)}
      </Accordion.Panel>
    </Accordion.Item>
  );
}

export function DataComplexityCards() {
  const hasDataComplexityFeature = hasPremiumFeature("data-complexity-score");
  const {
    data,
    isLoading,
    error: queryError,
  } = useGetDataComplexityScoresQuery(undefined, {
    skip: !hasDataComplexityFeature,
  });

  if (!hasDataComplexityFeature) {
    return null;
  }

  return (
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
      {match({ isLoading, queryError, data })
        .with({ isLoading: true }, () =>
          CATALOG_IDS.map((catalogId) => (
            <DataComplexityCardSkeleton key={catalogId} />
          )),
        )
        .with(
          { queryError: P.nonNullable },
          { data: P.nullish },
          ({ queryError }) => (
            <Card
              withBorder
              shadow="none"
              p="md"
              style={{ gridColumn: "1 / -1" }}
            >
              <Text fw={700}>{t`Data complexity scores`}</Text>
              <Text mt="xs" size="sm" c="text-secondary">
                {getErrorMessage(
                  queryError,
                  t`Data complexity scores are unavailable right now.`,
                )}
              </Text>
            </Card>
          ),
        )
        .with({ data: P.nonNullable }, ({ data }) =>
          CATALOG_IDS.map((key) => (
            <DataComplexityCard key={key} catalogId={key} catalog={data[key]} />
          )),
        )
        .exhaustive()}
    </SimpleGrid>
  );
}

function ratingToTextColor(
  rating: DataComplexityRating | null,
): MetabaseColorKey {
  return match(rating)
    .returnType<MetabaseColorKey>()
    .with("low", () => "success")
    .with("medium", () => "warning")
    .with("high", () => "error")
    .with(null, () => "text-secondary")
    .exhaustive();
}

function ScoreDisplayInline({
  score,
  ...rest
}: {
  score: ScoreAndRating | ScoreAndRatingError | DataComplexityFailure;
} & MantineStyleProps) {
  return match(score)
    .with({ score: P.nullish }, { error: P.nonNullable }, () => (
      <Text c="error" fw={700} lh="1rem" ml="auto" {...rest}>
        {t`Unavailable`}
      </Text>
    ))
    .with({ score: P.nonNullable }, ({ score, rating }) => (
      <Box
        ml="auto"
        px={8}
        py={4}
        bdrs="sm"
        bg={getRatingBadgeColors(rating).backgroundColor}
        {...rest}
      >
        <Text fw={700} lh="1rem" c={getRatingBadgeColors(rating).color}>
          {formatNumber(score, { maximumFractionDigits: 0 })}
        </Text>
      </Box>
    ))
    .exhaustive();
}

function getRatingBadgeColors(rating: DataComplexityRating | null): {
  backgroundColor: MetabaseColorKey;
  color: MetabaseColorKey;
} {
  return match(rating)
    .returnType<{
      backgroundColor: MetabaseColorKey;
      color: MetabaseColorKey;
    }>()
    .with("low", () => ({
      backgroundColor: "background-success-secondary",
      color: "success-secondary",
    }))
    .with("medium", () => ({
      backgroundColor: "background-warning-secondary",
      color: "text-primary",
    }))
    .with("high", () => ({
      backgroundColor: "background-error",
      color: "error",
    }))
    .with(null, () => ({
      backgroundColor: "background-tertiary",
      color: "text-secondary",
    }))
    .exhaustive();
}
