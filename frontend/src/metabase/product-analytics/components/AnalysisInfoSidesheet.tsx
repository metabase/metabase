import { useMemo } from "react";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import {
  SIDEBAR_WIDTH,
  SidebarCard,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EntityIdFooter } from "metabase/common/components/EntityIdFooter";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import { ActivityTimeline } from "metabase/common/data-studio/components/ActivityTimelineCard";
import { useToast } from "metabase/common/hooks";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { QuestionDetails } from "metabase/questions/components/QuestionDetails";
import { Stack } from "metabase/ui";
import Question from "metabase-lib/v1/Question";
import type { Card } from "metabase-types/api";

type AnalysisInfoSidesheetProps = {
  card: Card;
  /** After a revision is restored, which changes the card under the page. */
  onReverted: () => void;
  onClose: () => void;
};

/**
 * The query builder's Info sidesheet for a saved analysis: its description,
 * who made and last edited it, where it's saved, and its revision history.
 * Reverting a revision reloads the card, and with it the analysis.
 */
export const AnalysisInfoSidesheet = ({
  card,
  onReverted,
  onClose,
}: AnalysisInfoSidesheetProps) => {
  const [updateCard] = useUpdateCardMutation();
  const [sendToast] = useToast();
  const question = useMemo(() => new Question(card), [card]);
  const canWrite = card.can_write && !card.archived;

  const handleDescriptionChange = async (description: string | null) => {
    if (description === card.description) {
      return;
    }
    try {
      await updateCard({ id: card.id, description }).unwrap();
    } catch (error) {
      sendToast({
        message: getErrorMessage(error, t`Couldn't update the description`),
        icon: "warning",
      });
    }
  };

  return (
    <Sidesheet
      title={t`Info`}
      titleSize="h3"
      onClose={onClose}
      closeHotkey="]"
      isOpen
      size={SIDEBAR_WIDTH}
      footer={
        <EntityIdFooter
          items={[{ label: t`This question`, entityId: card.entity_id }]}
        />
      }
    >
      <Stack gap="xxl">
        <SidebarSection title={t`Description`} gap={0}>
          <Stack gap="sm">
            <SidesheetEditableDescription
              description={card.description}
              onChange={handleDescriptionChange}
              canWrite={canWrite}
            />
            <PLUGIN_MODERATION.ModerationReviewTextForQuestion
              question={question}
            />
          </Stack>
        </SidebarSection>
        <QuestionDetails question={question} />
        <SidebarSection title={t`History`}>
          <SidebarCard>
            <ActivityTimeline
              entity="card"
              id={card.id}
              moderationReviews={card.moderation_reviews}
              canWrite={canWrite}
              data-testid="saved-question-history-list"
              onReverted={onReverted}
            />
          </SidebarCard>
        </SidebarSection>
      </Stack>
    </Sidesheet>
  );
};
