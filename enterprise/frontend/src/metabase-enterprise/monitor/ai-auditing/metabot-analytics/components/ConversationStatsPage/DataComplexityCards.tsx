import { useDisclosure } from "@mantine/hooks";
import { P, match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import {
  Accordion,
  Alert,
  Badge,
  type BadgeColor,
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
import { getObjectEntries } from "metabase/utils/objects";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useGetDataComplexityScoresQuery } from "../../api";
import {
  DATA_COMPLEXITY_CATALOG_IDS,
  type DataComplexityCatalogId,
  type DataComplexityGroup,
  type DataComplexityNode,
  type DataComplexityRating,
} from "../../types";

import S from "./DataComplexityCards.module.css";

type RatingColorKey = DataComplexityRating | "default";

const RATING_BADGE_COLORS = {
  low: "positive",
  medium: "warning",
  high: "negative",
  default: "neutral",
} satisfies Record<RatingColorKey, BadgeColor>;

const RATING_TEXT_COLORS = {
  low: "feedback-positive",
  medium: "feedback-warning",
  high: "feedback-negative",
  default: "text-secondary",
} satisfies Record<RatingColorKey, MetabaseColorKey>;

const isGroupNode = (node: DataComplexityNode): node is DataComplexityGroup =>
  "components" in node;

function groupTitle(groupId: string): string {
  return match(groupId)
    .with("size", () => t`Size of this layer`)
    .with("ambiguity", () => t`Areas of ambiguity`)
    .with("metadata", () => t`Metadata coverage`)
    .otherwise(() => humanizeId(groupId));
}

// The backend can add measures without a frontend change, so unknown keys get a label derived from
// the key: "field_level_collisions" -> "Field level collisions".
function humanizeId(id: string): string {
  const text = id.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

type ComponentCopy = {
  label: string;
  description?: string;
  measurement?: string;
};

function getComponentCopy(id: string, node: DataComplexityNode): ComponentCopy {
  const measurement = "measurement" in node ? node.measurement : null;

  return match(id)
    .with("entity_count", () => ({
      label:
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
      label:
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
      label:
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
      label:
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
      label:
        measurement === null
          ? t`Duplicate measure names`
          : ngettext(
              msgid`${measurement} duplicate measure name`,
              `${measurement} duplicate measure names`,
              measurement,
            ),
      description: t`Duplicate measure names across included tables.`,
    }))
    .otherwise(() => ({
      label: humanizeId(id),
      measurement:
        measurement === null
          ? undefined
          : formatNumber(measurement, { maximumFractionDigits: 2 }),
    }));
}

function DataComplexityCardSkeleton() {
  return (
    <Card withBorder shadow="none" p="lg">
      <Box my={5} w="70%">
        <Skeleton h={14} />
      </Box>
      <Box my={5} w="40%">
        <Skeleton h={14} />
      </Box>
      <Stack align="center" gap={0} my="sm">
        <Skeleton h="3rem" w="30%" />
      </Stack>
    </Card>
  );
}

function DataComplexityCard({
  catalogId,
  catalog,
}: {
  catalogId: DataComplexityCatalogId;
  catalog: DataComplexityGroup;
}) {
  const [isModalOpen, { close, open }] = useDisclosure();
  const { subtitle, title } = match(catalogId)
    .with("library", () => ({
      title: t`Curated semantic layer`,
      subtitle: t`Metrics and published tables within your semantic layer.`,
    }))
    .with("universe", () => ({
      title: t`Full semantic layer`,
      subtitle: t`Semantic layer entities plus every active physical table.`,
    }))
    .with("metabot", () => ({
      title: t`Metabot-visible layer`,
      subtitle: t`The subset the internal Metabot can see.`,
    }))
    .exhaustive();

  return (
    <Card withBorder shadow="none" p="lg">
      <Stack component={UnstyledButton} onClick={open} flex={1} gap={0}>
        <Flex align="center" justify="space-between" gap="sm">
          <Text fw={700}>{title}</Text>
          <Icon name="expand" c="text-secondary" />
        </Flex>
        <Text c="text-secondary">{subtitle}</Text>
        {catalog.score != null ? (
          <Stack align="center" gap="sm" pt="sm" mt="auto" mb="sm">
            <Text
              size="2.5rem"
              lh="3rem"
              fw={700}
              c={RATING_TEXT_COLORS[catalog.rating ?? "default"]}
            >
              {formatNumber(catalog.score, { maximumFractionDigits: 0 })}
            </Text>
            <Text c="text-secondary">{catalog.rating_label}</Text>
          </Stack>
        ) : (
          <Stack align="center" ta="center" gap={4} pt="sm" mt="auto" mb="sm">
            <Text c="feedback-negative" fw={700}>{t`Score unavailable`}</Text>
            <Text c="text-secondary">{t`Open for component details.`}</Text>
          </Stack>
        )}
      </Stack>

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
  catalog: DataComplexityGroup;
}) {
  const hasError = catalog.score == null;

  return (
    <Stack gap="xl" mt="lg">
      {hasError && (
        <Alert size="compact" color="warning" icon={<Icon name="warning" />}>
          {t`Some component scores could not be computed.`}
        </Alert>
      )}

      {getObjectEntries(catalog.components).map(([groupId, group]) => (
        <Stack key={groupId} gap="lg" w="100%">
          <Flex align="center" justify="space-between" gap="xl">
            <Text fw={700} lh="1rem">
              {groupTitle(groupId)}
            </Text>
            <ScoreDisplayInline withTitle score={group} mr="2.75rem" />
          </Flex>

          {isGroupNode(group) && <DataComplexityAccordion group={group} />}
        </Stack>
      ))}
    </Stack>
  );
}

function DataComplexityAccordion({ group }: { group: DataComplexityGroup }) {
  return (
    <Accordion
      chevron={<Icon name="chevrondown" size={12} />}
      classNames={{
        chevron: S.accordionChevron,
        content: S.accordionContent,
        control: S.accordionControl,
        item: S.accordionItem,
        label: S.accordionLabel,
        root: S.accordionRoot,
      }}
    >
      {getObjectEntries(group.components).map(([id, node]) => (
        <DataComplexityComponentItem key={id} id={id} node={node} />
      ))}
    </Accordion>
  );
}

// Sub-groups such as `synonym_degree` nest another accordion inside their panel.
function DataComplexityComponentItem({
  id,
  node,
}: {
  id: string;
  node: DataComplexityNode;
}) {
  const { label, description, measurement } = getComponentCopy(id, node);

  return (
    <Accordion.Item value={id} bg="background_page-secondary" bd="0" mt={0}>
      <Accordion.Control>
        <Flex align="center" gap="sm" w="100%">
          <Text c="text-primary" fw={500} truncate>
            {label}
          </Text>
          {description && (
            <Tooltip label={description}>
              <Icon name="info" c="text-secondary" size={14} />
            </Tooltip>
          )}
          {measurement && (
            <Text c="text-secondary" size="sm">
              {measurement}
            </Text>
          )}
          <ScoreDisplayInline score={node} />
        </Flex>
      </Accordion.Control>
      <Accordion.Panel>
        <Stack gap="sm">
          {description && (
            <Text size="sm" c="text-secondary">
              {description}
            </Text>
          )}
          {isGroupNode(node) && <DataComplexityAccordion group={node} />}
          {match(node)
            .with({ error: P.string }, ({ error }) => (
              <Text c="feedback-negative" size="sm" role="alert">
                {error}
              </Text>
            ))
            .with({ rating_label: P.string }, ({ rating_label }) => (
              <Text size="sm" c="text-secondary">
                {rating_label}
              </Text>
            ))
            .otherwise(() => null)}
        </Stack>
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
    <SimpleGrid cols={{ base: 1, md: 3 }} spacing="xl">
      {match({ isLoading, queryError, data })
        .with({ isLoading: true }, () =>
          DATA_COMPLEXITY_CATALOG_IDS.map((catalogId) => (
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
              p="lg"
              style={{ gridColumn: "1 / -1" }}
            >
              <Text fw={700}>{t`Data complexity scores`}</Text>
              <Text mt="xxs" size="sm" c="text-secondary">
                {getErrorMessage(
                  queryError,
                  t`Data complexity scores are unavailable right now.`,
                )}
              </Text>
            </Card>
          ),
        )
        .with({ data: P.nonNullable }, ({ data }) =>
          DATA_COMPLEXITY_CATALOG_IDS.map((key) => (
            <DataComplexityCard key={key} catalogId={key} catalog={data[key]} />
          )),
        )
        .exhaustive()}
    </SimpleGrid>
  );
}

function ScoreDisplayInline({
  withTitle,
  score,
  ...rest
}: {
  withTitle?: boolean;
  score: DataComplexityNode;
} & MantineStyleProps) {
  const value = score.score ?? null;

  if (value === null) {
    return (
      <Text c="feedback-negative" fw={700} lh="1rem" ml="auto" {...rest}>
        {withTitle ? t`Complexity score unavailable` : t`Unavailable`}
      </Text>
    );
  }

  const rating = "rating" in score ? (score.rating ?? null) : null;
  const formattedScore = formatNumber(value, { maximumFractionDigits: 0 });

  return (
    <Badge
      size="sm"
      color={RATING_BADGE_COLORS[rating ?? "default"]}
      ml="auto"
      {...rest}
    >
      {withTitle ? t`Complexity score ${formattedScore}` : formattedScore}
    </Badge>
  );
}
