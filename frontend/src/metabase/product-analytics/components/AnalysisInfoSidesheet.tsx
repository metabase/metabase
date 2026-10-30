import { useHotkeys } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { useUpdateCardMutation } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils";
import { EntityIdCard } from "metabase/common/components/EntityIdCard";
import {
  SIDESHEET_HORIZONTAL_PADDING,
  Sidesheet,
  SidesheetCard,
  SidesheetCardTitle,
  SidesheetTabPanelContainer,
} from "metabase/common/components/Sidesheet";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import SidesheetStyles from "metabase/common/components/Sidesheet/sidesheet.module.css";
import { ActivityTimeline } from "metabase/common/data-studio/components/ActivityTimelineCard";
import { useToast } from "metabase/common/hooks";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { QuestionDetails } from "metabase/questions/components/QuestionDetails";
import { Stack, Tabs } from "metabase/ui";
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
  // Mounted closed, then opened, so the sheet slides in.
  const [isOpen, setIsOpen] = useState(false);
  useMount(() => setIsOpen(true));
  useHotkeys([["]", onClose]]);

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
      isOpen={isOpen}
      onClose={onClose}
      removeBodyPadding
      size="md"
      data-testid="analysis-info-sidesheet"
    >
      <Tabs
        defaultValue="overview"
        className={SidesheetStyles.FlexScrollContainer}
      >
        <Tabs.List mx={SIDESHEET_HORIZONTAL_PADDING}>
          <Tabs.Tab value="overview">{t`Overview`}</Tabs.Tab>
          <Tabs.Tab value="history">{t`History`}</Tabs.Tab>
        </Tabs.List>
        <SidesheetTabPanelContainer>
          <Tabs.Panel value="overview">
            <Stack gap="xl">
              <SidesheetCard pb="lg">
                <Stack gap={0}>
                  <SidesheetCardTitle>{t`Description`}</SidesheetCardTitle>
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
                </Stack>
              </SidesheetCard>
              <SidesheetCard>
                <QuestionDetails question={question} />
              </SidesheetCard>
              <EntityIdCard entityId={card.entity_id} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="history">
            <SidesheetCard>
              <ActivityTimeline
                entity="card"
                id={card.id}
                moderationReviews={card.moderation_reviews}
                canWrite={canWrite}
                data-testid="saved-question-history-list"
                onReverted={onReverted}
              />
            </SidesheetCard>
          </Tabs.Panel>
        </SidesheetTabPanelContainer>
      </Tabs>
    </Sidesheet>
  );
};
