import { t } from "ttag";

import { useGetMetabotDigestQuery } from "metabase/metabot/api";
import { MetabotIcon } from "metabase/metabot/components/MetabotIcon";
import { Badge, Box, Card, Group, Icon, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { IconName, MetabotDigestItem } from "metabase-types/api";

import { MetabotDigestLoader } from "./MetabotDigestLoader";
import S from "./MetabotDigestPage.module.css";

/**
 * `card_type` distinguishes questions, models and metrics, which all live in `report_card` but have
 * their own URLs and their own icons.
 */
const cardSubtype = ({ model, card_type }: MetabotDigestItem) =>
  model === "card" ? (card_type ?? "question") : model;

const ICONS: Record<string, IconName> = {
  question: "table",
  model: "model",
  metric: "metric",
  dashboard: "dashboard",
  table: "table",
  collection: "collection",
  document: "document",
};

const URL_MODELS: Record<string, string> = {
  model: "dataset",
  metric: "metric",
  question: "card",
};

const SIGNAL_LABELS: Record<string, string> = {
  get "data-anomaly"() {
    return t`Something moved`;
  },
  get alert() {
    return t`Alert`;
  },
  get subscription() {
    return t`Subscription`;
  },
  get bookmark() {
    return t`Bookmarked`;
  },
  get authored() {
    return t`You built this`;
  },
  get "recent-view"() {
    return t`Viewed recently`;
  },
  get "instance-popularity"() {
    return t`Popular`;
  },
};

/**
 * Where an item should take you. When something moved, that is the analysed query opened as an ad-hoc question —
 * the chart the anomaly was actually found in, so one click lands on the movement itself rather than on a page
 * where you have to go looking for it. Items with no news fall back to their own entity page.
 */
const itemUrl = (item: MetabotDigestItem, subtype: string) => {
  if (item.anomaly_query) {
    return Urls.serializedQuestion({
      display: item.anomaly_display ?? "line",
      dataset_query: item.anomaly_query,
      visualization_settings: {},
    });
  }
  return Urls.modelToUrl({
    id: item.id,
    model: URL_MODELS[subtype] ?? subtype,
    name: item.name ?? "",
  });
};

const DigestItemCard = ({ item }: { item: MetabotDigestItem }) => {
  const subtype = cardSubtype(item);
  const hasNews = item.signals.includes("data-anomaly");
  const url = itemUrl(item, subtype);

  return (
    <Card
      component="a"
      href={url}
      p="lg"
      withBorder
      shadow="none"
      className={`${S.card} ${hasNews ? S.hasNews : ""}`}
    >
      <Group gap="md" align="flex-start" wrap="nowrap">
        <Box c={hasNews ? "brand" : "text-secondary"} mt="0.125rem">
          <Icon name={ICONS[subtype] ?? "table"} size={20} />
        </Box>

        <Stack gap="xs" flex={1} miw={0}>
          <Title order={4} c="text-primary" lh={1.3} className={S.name}>
            {item.name ?? t`Untitled`}
          </Title>

          {item.reason && (
            <Text c="text-secondary" lh={1.5}>
              {item.reason}
            </Text>
          )}

          {item.signals.length > 0 && (
            <Group gap="xs" mt="0.25rem">
              {item.signals.map((signal) => (
                <Badge
                  key={signal}
                  variant="light"
                  color={signal === "data-anomaly" ? "brand" : "neutral"}
                  tt="none"
                  fw="normal"
                  px="sm"
                >
                  {SIGNAL_LABELS[signal] ?? signal}
                </Badge>
              ))}
            </Group>
          )}
        </Stack>
      </Group>
    </Card>
  );
};

export const MetabotDigestPage = () => {
  const { data, isLoading, error } = useGetMetabotDigestQuery();

  const items = data?.items ?? [];
  const newsCount = items.filter((item) =>
    item.signals.includes("data-anomaly"),
  ).length;

  return (
    <Box p="xl" maw="52rem" mx="auto" w="100%">
      <Group gap="sm" mb="lg" align="center">
        <Box c="brand" display="inline-flex">
          <MetabotIcon size={28} />
        </Box>
        <Box>
          <Title order={1} lh={1.2}>{t`Your digest`}</Title>
          {!isLoading && !error && (
            <Text size="sm" c="text-secondary">
              {newsCount > 0
                ? t`${newsCount} of these moved recently.`
                : t`Nothing moved today — here's what you keep an eye on.`}
            </Text>
          )}
        </Box>
      </Group>

      {isLoading && <MetabotDigestLoader message={t`Building your digest…`} />}

      {!isLoading && (error || data?.error) && (
        <Card p="xl" withBorder shadow="none">
          <Stack align="center" gap="sm">
            <Icon name="warning" size={24} c="error" />
            <Text c="text-secondary">{t`Something went wrong building your digest.`}</Text>
          </Stack>
        </Card>
      )}

      {!isLoading && !error && !data?.error && (
        <Stack gap="lg">
          {data?.summary && (
            <Text size="lg" c="text-primary" lh={1.5}>
              {data.summary}
            </Text>
          )}

          {items.length === 0 ? (
            <Card p="xl" withBorder shadow="none">
              <Stack align="center" gap="sm">
                <MetabotIcon size={32} />
                <Text c="text-secondary" ta="center">
                  {t`Nothing to report yet. Bookmark something or set up an alert, and it'll show up here.`}
                </Text>
              </Stack>
            </Card>
          ) : (
            <Stack gap="md">
              {items.map((item) => (
                <DigestItemCard key={`${item.model}-${item.id}`} item={item} />
              ))}
            </Stack>
          )}
        </Stack>
      )}
    </Box>
  );
};
