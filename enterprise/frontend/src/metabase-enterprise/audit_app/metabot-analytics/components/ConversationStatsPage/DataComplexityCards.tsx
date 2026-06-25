import { useDisclosure } from "@mantine/hooks";
import { P, match } from "ts-pattern";
import { t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import {
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

type RatingColorKey = DataComplexityRating | "default";

// A node with `components` is a grouping; one with `error` (and no measurement) is a failure;
// otherwise it is a scored leaf. The breakdown renderer keys on these to walk the tree generically.
const isGroupNode = (node: DataComplexityNode): node is DataComplexityGroup =>
  "components" in node;
const isFailureNode = (node: DataComplexityNode): boolean =>
  "error" in node && !("measurement" in node);

// Section titles for the well-known top-level groups; any other key is humanized from its id.
function groupTitle(groupId: string): string {
  switch (groupId) {
    case "size":
      return t`Size of this layer`;
    case "ambiguity":
      return t`Areas of ambiguity`;
    case "metadata":
      return t`Metadata coverage`;
    default:
      return humanizeId(groupId);
  }
}

// "field_level_collisions" -> "Field level collisions". Keeps the renderer measure-agnostic so new
// backend measures show up without per-key frontend changes.
function humanizeId(id: string): string {
  const text = id.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const RATING_BADGE_BACKGROUND_COLORS = {
  low: "feedback-positive-selected",
  medium: "background_surface-warning-strong",
  high: "background_surface-error",
  default: "background_page-tertiary",
} satisfies Record<RatingColorKey, MetabaseColorKey>;

const RATING_BADGE_TEXT_COLORS = {
  low: "success-secondary",
  medium: "text-primary",
  high: "error",
  default: "text-secondary",
} satisfies Record<RatingColorKey, MetabaseColorKey>;

const RATING_TEXT_COLORS = {
  low: "success",
  medium: "warning",
  high: "error",
  default: "text-secondary",
} satisfies Record<RatingColorKey, MetabaseColorKey>;

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
  catalog: DataComplexityGroup;
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
        {catalog.score != null ? (
          <Stack align="center" gap="sm" my="sm">
            <Text
              size="4rem"
              fw={700}
              c={RATING_TEXT_COLORS[catalog.rating ?? "default"]}
            >
              {formatNumber(catalog.score, { maximumFractionDigits: 0 })}
            </Text>
            <Text c="text-secondary">{catalog.rating_label}</Text>
          </Stack>
        ) : (
          <Stack gap={4} my="sm">
            <Text c="error" fw={700}>{t`Score unavailable`}</Text>
            <Text c="text-secondary">{t`Open for component details.`}</Text>
          </Stack>
        )}
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
  catalog: DataComplexityGroup;
}) {
  const hasError = catalog.score == null;

  return (
    <Stack gap="lg" mt="md">
      {hasError && (
        <Alert color="warning" icon={<Icon name="warning" />}>
          {t`Some component scores could not be computed.`}
        </Alert>
      )}

      {getObjectEntries(catalog.components).map(([groupId, group]) => (
        <Stack key={groupId} gap="sm" w="100%">
          <Flex align="center" justify="space-between" gap="lg">
            <Text fw={700} lh="1rem">
              {groupTitle(groupId)}
            </Text>
            <ScoreDisplayInline withTitle score={group} mr="2.75rem" />
          </Flex>

          <Stack gap="xs">
            {isGroupNode(group)
              ? getObjectEntries(group.components).map(([id, node]) => (
                  <DataComplexityNodeRow
                    key={id}
                    id={id}
                    node={node}
                    depth={0}
                  />
                ))
              : null}
          </Stack>
        </Stack>
      ))}
    </Stack>
  );
}

// Recursively render one node of the score tree. Leaves show their measurement + score; failures
// show the error; groupings (including arbitrarily-nested sub-groups like synonym-degree) show a
// rolled-up score and indent their children. Labels are derived from the node key, so new backend
// measures render without per-key frontend changes.
function DataComplexityNodeRow({
  id,
  node,
  depth,
}: {
  id: string;
  node: DataComplexityNode;
  depth: number;
}) {
  const label = humanizeId(id);
  const indent = depth > 0 ? "md" : 0;

  if (isGroupNode(node)) {
    return (
      <Stack gap="xs" pl={indent}>
        <Flex align="center" justify="space-between" gap="sm">
          <Text fw={500} c="text-primary">
            {label}
          </Text>
          <ScoreDisplayInline score={node} />
        </Flex>
        <Stack gap="xs">
          {getObjectEntries(node.components).map(([childId, child]) => (
            <DataComplexityNodeRow
              key={childId}
              id={childId}
              node={child}
              depth={depth + 1}
            />
          ))}
        </Stack>
      </Stack>
    );
  }

  if (isFailureNode(node)) {
    return (
      <Flex align="center" justify="space-between" gap="sm" pl={indent}>
        <Text c="text-primary">{label}</Text>
        <Text c="error" size="sm" role="alert">
          {"error" in node ? node.error : null}
        </Text>
      </Flex>
    );
  }

  return (
    <Flex align="center" justify="space-between" gap="sm" pl={indent}>
      <Text c="text-primary" truncate>
        {label}
      </Text>
      <Flex align="center" gap="sm">
        <Text c="text-secondary" size="sm">
          {"measurement" in node
            ? formatNumber(node.measurement, { maximumFractionDigits: 2 })
            : null}
        </Text>
        <ScoreDisplayInline score={node} />
      </Flex>
    </Flex>
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
  const value = "score" in score ? score.score : null;
  const rating = "rating" in score ? (score.rating ?? null) : null;

  if (value == null) {
    return (
      <Text c="error" fw={700} lh="1rem" ml="auto" {...rest}>
        {withTitle ? t`Complexity score unavailable` : t`Unavailable`}
      </Text>
    );
  }

  const ratingColorKey = rating ?? "default";

  return (
    <Flex
      ml="auto"
      px={8}
      py={4}
      bdrs="sm"
      bg={RATING_BADGE_BACKGROUND_COLORS[ratingColorKey]}
      {...rest}
      gap="sm"
    >
      {withTitle && (
        <Text
          lh="1rem"
          c={RATING_BADGE_TEXT_COLORS[ratingColorKey]}
        >{t`Complexity score`}</Text>
      )}
      <Text fw={700} lh="1rem" c={RATING_BADGE_TEXT_COLORS[ratingColorKey]}>
        {formatNumber(value, { maximumFractionDigits: 0 })}
      </Text>
    </Flex>
  );
}
