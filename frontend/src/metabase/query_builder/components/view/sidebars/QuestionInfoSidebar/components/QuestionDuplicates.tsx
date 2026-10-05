import { t } from "ttag";

import { skipToken, useSearchQuery } from "metabase/api";
import { Link } from "metabase/common/components/Link";
import { SidesheetCard } from "metabase/common/components/Sidesheet";
import { useSetting } from "metabase/settings";
import { Anchor, Stack, Text } from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";
import type { SearchResult } from "metabase-types/api";

// This is Metabase's normalized similarity score (1 - cosine distance / 2),
// not a probability. Adjust this threshold for the hackathon demo.
const DUPLICATE_SIMILARITY_THRESHOLD = 0.82;

export function QuestionDuplicates({ question }: { question: Question }) {
  const searchEngine = useSetting("search-engine");
  const query = [question.card().name, question.description()]
    .filter(Boolean)
    .join("\n")
    .trim();
  const enabled =
    searchEngine === "semantic" &&
    question.isSaved() &&
    question.type() === "question" &&
    !question.card().archived &&
    query.length > 0;

  const { currentData, isError } = useSearchQuery(
    enabled
      ? {
          q: query,
          search_engine: "semantic",
          context: "search-app",
          models: ["card"],
          archived: false,
          include_dashboard_questions: true,
          limit: 100,
        }
      : skipToken,
  );

  if (!enabled) {
    return null;
  }

  if (
    isError ||
    (currentData && currentData.engine !== "search.engine/semantic")
  ) {
    return (
      <SidesheetCard title={t`Related questions`}>
        <Text c="text-secondary">{t`Unable to check for related questions right now.`}</Text>
      </SidesheetCard>
    );
  }

  if (!currentData) {
    return (
      <SidesheetCard title={t`Related questions`}>
        <Text c="text-secondary">{t`Checking for related questions`}</Text>
      </SidesheetCard>
    );
  }

  const duplicates = currentData.data
    .filter(
      (result): result is SearchResult<number, "card"> =>
        result.model === "card" &&
        typeof result.id === "number" &&
        result.id !== question.id(),
    )
    .map((result) => ({
      result,
      similarity:
        result.scores?.find((score) => score.name === "semantic-distance")
          ?.score ?? 0,
    }))
    .filter(({ similarity }) => similarity >= DUPLICATE_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 3);

  return (
    <SidesheetCard title={t`Related questions`}>
      <Stack gap="xs">
        <Text c="text-secondary">
          {duplicates.length > 0
            ? t`These questions have similar titles or descriptions and may be related.`
            : t`No related questions found.`}
        </Text>
        {duplicates.map(({ result }) => (
          <Anchor
            key={result.id}
            component={Link}
            to={Urls.card({ id: result.id, name: result.name })}
            size="sm"
          >
            {result.name}
          </Anchor>
        ))}
      </Stack>
    </SidesheetCard>
  );
}
