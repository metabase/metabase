import { useDisclosure } from "@mantine/hooks";
import { P, match } from "ts-pattern";
import { msgid, ngettext, t } from "ttag";

import { getErrorMessage } from "metabase/api/utils";
import {
  Alert,
  Box,
  Button,
  Card,
  Flex,
  Group,
  Icon,
  Modal,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  UnstyledButton,
} from "metabase/ui";
import { formatNumber } from "metabase/utils/formatting";
import { hasPremiumFeature } from "metabase-enterprise/settings";

import { useGetDataComplexityScoresQuery } from "../../api";
import type {
  DataComplexityCatalog,
  DataComplexityCatalogId,
  DataComplexityComponentId,
} from "../../types";

const CATALOG_IDS: DataComplexityCatalogId[] = [
  "library",
  "universe",
  "metabot",
];

type DataComplexityComponentGroupId = "size" | "ambiguity";

const COMPONENT_GROUPS: {
  groupId: DataComplexityComponentGroupId;
  componentIds: DataComplexityComponentId[];
}[] = [
  {
    groupId: "size",
    componentIds: ["entity_count", "field_count"],
  },
  {
    groupId: "ambiguity",
    componentIds: ["name_collisions", "synonym_pairs", "repeated_measures"],
  },
];

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
  const { title, subtitle } = match(catalogId)
    .with("library", () => ({
      title: t`Curated semantic layer`,
      subtitle: t`Models and metrics from the curated Library subset.`,
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
          <Icon name="chevronright" size={12} c="text-tertiary" />
        </Flex>
        <Text c="text-secondary">{subtitle}</Text>
        {match(catalog.total)
          .with(P.number, (total) => (
            <Stack align="center" gap="sm" my="sm">
              <Text size="4rem" fw={700}>
                {formatNumber(total, { maximumFractionDigits: 0 })}
              </Text>
              <Text c="text-secondary">{t`Lower is better`}</Text>
            </Stack>
          ))
          .otherwise(() => (
            <Stack gap={4} my="sm">
              <Text c="error" fw={700}>{t`Score unavailable`}</Text>
              <Text c="text-secondary">{t`Open for component details.`}</Text>
            </Stack>
          ))}
      </UnstyledButton>

      <Modal opened={isModalOpen} onClose={close} title={title} size="lg">
        <Stack gap="lg">
          <Text size="sm" c="text-secondary">
            {subtitle}
          </Text>
          <DataComplexityBreakdown catalog={catalog} />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>{t`Close`}</Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

function DataComplexityBreakdown({
  catalog,
}: {
  catalog: DataComplexityCatalog;
}) {
  const hasError = catalog.total == null;

  return (
    <Stack gap="lg">
      {hasError && (
        <Alert color="warning" icon={<Icon name="warning" />}>
          {t`Some component scores could not be computed.`}
        </Alert>
      )}

      {COMPONENT_GROUPS.map(({ groupId, componentIds }) => {
        const { title, description } = match(groupId)
          .with("size", () => ({
            title: t`Size`,
            description: t`How much surface area this layer exposes.`,
          }))
          .with("ambiguity", () => ({
            title: t`Ambiguity`,
            description: t`Signals that similar or repeated names could make answers harder to trust.`,
          }))
          .exhaustive();

        return (
          <Box key={groupId}>
            <Text fw={700}>{title}</Text>
            <Text size="sm" c="text-secondary">
              {description}
            </Text>

            <Stack gap="sm" mt="md">
              {componentIds.map((componentId) => (
                <DataComplexityComponentItem
                  key={componentId}
                  componentId={componentId}
                  catalog={catalog}
                />
              ))}
            </Stack>
          </Box>
        );
      })}
    </Stack>
  );
}

function DataComplexityComponentItem({
  componentId,
  catalog,
}: {
  componentId: DataComplexityComponentId;
  catalog: DataComplexityCatalog;
}) {
  const component = catalog.components[componentId];
  const measurement = component.measurement;

  const { title, description, count } = match(componentId)
    .with("entity_count", () => ({
      title: t`Entity count`,
      description: t`How many tables, models, and metrics are included in this layer.`,
      count:
        measurement !== null &&
        ngettext(
          msgid`${measurement} entity`,
          `${measurement} entities`,
          measurement,
        ),
    }))
    .with("name_collisions", () => ({
      title: t`Name collisions`,
      description: t`Exact duplicate names after normalization, which can make entities harder to distinguish.`,
      count:
        measurement !== null &&
        ngettext(
          msgid`${measurement} collision`,
          `${measurement} collisions`,
          measurement,
        ),
    }))
    .with("synonym_pairs", () => ({
      title: t`Synonym pairs`,
      description: t`Pairs of entity names that are semantically similar enough to be treated as possible synonyms.`,
      count:
        measurement !== null &&
        ngettext(
          msgid`${measurement} similar pair`,
          `${measurement} similar pairs`,
          measurement,
        ),
    }))
    .with("field_count", () => ({
      title: t`Field count`,
      description: t`Active physical-table fields exposed through this layer.`,
      count:
        measurement !== null &&
        ngettext(
          msgid`${measurement} field`,
          `${measurement} fields`,
          measurement,
        ),
    }))
    .with("repeated_measures", () => ({
      title: t`Repeated measures`,
      description: t`Duplicate measure names across included tables.`,
      count:
        measurement !== null &&
        ngettext(
          msgid`${measurement} repeated name`,
          `${measurement} repeated names`,
          measurement,
        ),
    }))
    .exhaustive();

  return (
    <Box
      p="md"
      bdrs="md"
      bg="background-secondary"
      style={{
        border: "1px solid var(--mb-color-border)",
      }}
    >
      <Flex gap="md" justify="space-between" align="flex-start">
        <Group gap="sm" align="flex-start" wrap="nowrap" flex={1}>
          <Box>
            <Text fw={700}>{title}</Text>
            <Text size="sm" c="text-secondary">
              {description}
            </Text>
            {component.score === null && (
              <Text mt="sm" size="sm" c="error" role="alert">
                {component.error}
              </Text>
            )}
          </Box>
        </Group>

        {count !== false && (
          <Box
            px="sm"
            py={4}
            bdrs="sm"
            bg="background-primary"
            style={{
              border: "1px solid var(--mb-color-border)",
              flexShrink: 0,
            }}
          >
            <Text
              size="sm"
              fw={700}
              c="text-secondary"
              style={{ whiteSpace: "nowrap" }}
            >
              {count}
            </Text>
          </Box>
        )}
      </Flex>
    </Box>
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
