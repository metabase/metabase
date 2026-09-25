import { match } from "ts-pattern";
import { t } from "ttag";

import { Button, Card, Flex, Group, Stack, Text, Title } from "metabase/ui";

import { useScoreMetabotConversationMutation } from "../../api";
import type {
  ConversationReview,
  ConversationReviewLabel,
  ConversationReviewTurn,
} from "../../types";
import { ConversationIssues } from "../ConversationIssues";

const getVerdict = (label: ConversationReviewLabel) =>
  match(label)
    .with("ok", () => t`No issues detected`)
    .with("friction", () => t`Friction`)
    .with("failed", () => t`Failed`)
    .exhaustive();

const formatAnswer = (value: string) => value.replaceAll("_", " ");

const TONE_LABELS = [
  () => t`neutral`,
  () => t`terse`,
  () => t`exasperated`,
  () => t`hostile`,
];

const getToneLabel = (score: number) =>
  TONE_LABELS[Math.min(TONE_LABELS.length - 1, Math.round(score))]();

type ConversationReviewCardProps = {
  conversationId: string;
  review: ConversationReview | null;
};

export function ConversationReviewCard({
  conversationId,
  review,
}: ConversationReviewCardProps) {
  const [scoreConversation, { isLoading, error }] =
    useScoreMetabotConversationMutation();

  const conversationAnswers = review?.answers?.conversation;
  const turns = review?.answers?.turns ?? [];

  return (
    <Stack gap="lg" data-testid="conversation-review">
      <Flex align="baseline" justify="space-between">
        <Title order={3}>{t`Quality`}</Title>
        <Button
          variant="subtle"
          size="sm"
          loading={isLoading}
          onClick={() => scoreConversation(conversationId)}
        >
          {review ? t`Re-score` : t`Score now`}
        </Button>
      </Flex>
      <Card withBorder shadow="none" p="lg">
        {review ? (
          <Stack gap="sm">
            <Group gap="sm" align="center">
              <Text fw={700}>{getVerdict(review.label)}</Text>
              <ConversationIssues
                label={review.label}
                issues={review.issues}
                needsReview={review.review}
              />
            </Group>
            {conversationAnswers && (
              <Text size="sm" c="text-secondary">
                {[
                  conversationAnswers.outcome &&
                    t`Outcome: ${formatAnswer(conversationAnswers.outcome.choice)}`,
                  conversationAnswers.ending &&
                    t`Ending: ${formatAnswer(conversationAnswers.ending.choice)}`,
                  conversationAnswers.frustration &&
                    t`Frustration: ${conversationAnswers.frustration.score.toFixed(1)} / 3`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
            )}
            {turns.length > 0 && <TurnTrajectory turns={turns} />}
          </Stack>
        ) : (
          <Text c="text-secondary">{t`This conversation hasn't been reviewed yet.`}</Text>
        )}
        {error != null && (
          <Text c="error" size="sm" mt="sm">{t`Scoring failed.`}</Text>
        )}
      </Card>
    </Stack>
  );
}

function TurnTrajectory({
  turns,
}: {
  turns: readonly ConversationReviewTurn[];
}) {
  return (
    <Stack gap="xxs">
      <Text size="sm" fw={700}>{t`User follow-ups`}</Text>
      {turns.map((turn) => (
        <Text key={turn.index} size="sm" c="text-secondary">
          {[
            t`Message ${turn.index + 1}`,
            turn.reaction && formatAnswer(turn.reaction.choice),
            turn.tone && getToneLabel(turn.tone.score),
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      ))}
    </Stack>
  );
}
