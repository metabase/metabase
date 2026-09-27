import { useEffect, useState } from "react";
import { t } from "ttag";

import {
  type ExplorationRanking,
  useRankExplorationsMutation,
} from "metabase/api/jev";
import { Link } from "metabase/common/components/Link";
import { Box, Card, Stack, Text, Title } from "metabase/ui";
import type { RelatedDashboardXRayItem } from "metabase-types/api";

export function JevExplorations({
  candidates,
  context,
}: {
  candidates: (RelatedDashboardXRayItem & { kind: string })[];
  context: string;
}) {
  const [rank] = useRankExplorationsMutation();
  const [response, setResponse] = useState<{
    key: string;
    report?: ExplorationRanking;
    error?: boolean;
  }>();
  const actions = candidates.slice(0, 32);
  const payload = JSON.stringify({
    context: context.slice(0, 6000),
    candidates: actions.map((action, i) => ({
      id: `action_${i}`,
      title: action.title.slice(0, 300),
      description: (action.description ?? "").slice(0, 700),
      kind: action.kind.slice(0, 60),
    })),
  });
  useEffect(() => {
    if (!candidates.length) {
      return;
    }
    let active = true;
    const request = rank(JSON.parse(payload));
    request
      .unwrap()
      .then((report) => {
        if (active) {
          setResponse({ key: payload, report });
        }
      })
      .catch(() => {
        if (active) {
          setResponse({ key: payload, error: true });
        }
      });
    return () => {
      active = false;
      request.abort();
    };
  }, [payload, candidates.length, rank]);

  if (!actions.length) {
    return null;
  }
  const current = response?.key === payload ? response : undefined;
  const report = current?.report;
  const byId = new Map(actions.map((action, i) => [`action_${i}`, action]));
  const selected = [...new Set(report?.selected ?? [])].flatMap((id) => {
    const action = byId.get(id);
    return action ? [{ ...action, id }] : [];
  });

  return (
    <Box mb="lg" data-testid="jev-explorations">
      <Title order={3} mb="sm">{t`Explore next`}</Title>
      <Text
        size="xs"
        c="text-secondary"
        mb="sm"
      >{t`JEV experiment · based on this X-ray's context, not its results`}</Text>
      {!current && (
        <Text size="sm" role="status">{t`Choosing explorations…`}</Text>
      )}
      {(current?.error || report?.status === "unavailable") && (
        <Text
          size="sm"
          role="status"
        >{t`JEV is unavailable. More X-rays are listed below.`}</Text>
      )}
      {report && report.status !== "unavailable" && !selected.length && (
        <Text size="sm">{t`No clear next step. Try one of the X-rays below.`}</Text>
      )}
      <Stack gap="sm">
        {selected.map((action) => (
          <Card
            key={action.id}
            component={Link}
            to={action.url}
            p="md"
            withBorder
          >
            <Text fw="bold">{action.title}</Text>
            {action.description && (
              <Text size="sm" c="text-secondary">
                {action.description}
              </Text>
            )}
          </Card>
        ))}
      </Stack>
      {report && (
        <Box component="details" mt="sm">
          <Box
            component="summary"
            style={{ cursor: "pointer" }}
          >{t`JEV decisions`}</Box>
          <Text
            size="xs"
            my="xs"
          >{t`${actions.length} candidates · ${Math.round(report.elapsed_ms)} ms`}</Text>
          <Text size="xs">
            {report.usage
              ? t`${report.usage.input_tokens} input + ${report.usage.output_tokens} output tokens`
              : t`Token usage not reported`}
          </Text>
          <Text
            size="xs"
            c="text-secondary"
            my="xs"
          >{t`Scores describe next-step relevance on a 0–3 rubric, not probabilities. Up to three suggestions; at most two from one action family.`}</Text>
          {report.ranked.map((item) => (
            <Text key={item.id} size="xs" my={4}>
              {report.selected.includes(item.id) ? "✓ " : ""}
              {item.title}:{" "}
              {item.score == null ? t`unscored` : item.score.toFixed(2)}
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
