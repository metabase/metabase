import { t } from "ttag";

import { useGetMetabotDigestQuery } from "metabase/metabot/api";
import { Box, Card, Group, Icon, Stack, Text, Title } from "metabase/ui";
import * as Urls from "metabase/urls";
import type { MetabotDigestItem } from "metabase-types/api";

/**
 * `card_type` distinguishes questions, models and metrics, which all live in `report_card` but have
 * their own URLs.
 */
const toUrlModel = ({ model, card_type }: MetabotDigestItem): string => {
  if (model !== "card") {
    return model;
  }
  if (card_type === "model") {
    return "dataset";
  }
  if (card_type === "metric") {
    return "metric";
  }
  return "card";
};

const SIGNAL_LABELS: Record<string, string> = {
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

const DigestItemCard = ({ item }: { item: MetabotDigestItem }) => {
  const url = Urls.modelToUrl({
    id: item.id,
    model: toUrlModel(item),
    name: item.name ?? "",
  });

  return (
    <Card
      component="a"
      href={url}
      p="lg"
      withBorder
      shadow="none"
      style={{ textDecoration: "none" }}
    >
      <Stack gap="xs">
        <Group gap="sm" wrap="nowrap">
          <Icon name={item.model === "dashboard" ? "dashboard" : "table"} />
          <Title order={4} c="text-primary" lh={1.3}>
            {item.name ?? t`Untitled`}
          </Title>
        </Group>

        {item.reason && <Text c="text-secondary">{item.reason}</Text>}

        {item.signals.length > 0 && (
          <Group gap="xs" mt="xs">
            {item.signals.map((signal) => (
              <Text key={signal} size="sm" c="text-tertiary">
                {SIGNAL_LABELS[signal] ?? signal}
              </Text>
            ))}
          </Group>
        )}
      </Stack>
    </Card>
  );
};

export const MetabotDigestPage = () => {
  const { data, isLoading, error } = useGetMetabotDigestQuery();

  if (isLoading) {
    return (
      <Box p="xl">
        <Text c="text-secondary">{t`Putting your digest together…`}</Text>
      </Box>
    );
  }

  if (error || data?.error) {
    return (
      <Box p="xl">
        <Text c="error">{t`Something went wrong building your digest.`}</Text>
      </Box>
    );
  }

  const items = data?.items ?? [];

  return (
    <Box p="xl" maw="48rem" mx="auto">
      <Stack gap="lg">
        <Box>
          <Title order={1}>{t`Your digest`}</Title>
          {data?.summary && (
            <Text c="text-secondary" mt="sm">
              {data.summary}
            </Text>
          )}
        </Box>

        {items.length === 0 ? (
          <Text c="text-secondary">
            {t`Nothing stands out right now. Bookmark something or set up an alert, and it'll show up here.`}
          </Text>
        ) : (
          <Stack gap="md">
            {items.map((item) => (
              <DigestItemCard key={`${item.model}-${item.id}`} item={item} />
            ))}
          </Stack>
        )}
      </Stack>
    </Box>
  );
};
