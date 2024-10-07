import { useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import {
  Sidesheet,
  SidesheetCard,
  SidesheetTabPanelContainer,
} from "metabase/common/components/Sidesheet";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import SidesheetStyles from "metabase/common/components/Sidesheet/sidesheet.module.css";
import { EntityIdCard } from "metabase/components/EntityIdCard";
import Link from "metabase/core/components/Link";
import { InsightsUpsellTab } from "metabase/dashboard/components/DashboardInfoSidebar/components/InsightsUpsellTab";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_AUDIT, PLUGIN_MODERATION } from "metabase/plugins";
import { onCloseQuestionInfo } from "metabase/query_builder/actions";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";
import { Box, Stack, Tabs, Title } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { QuestionDetails } from "./QuestionDetails";

interface QuestionInfoSidebarProps {
  question: Question;
  onSave: (question: Question) => Promise<Question>;
}

export const QuestionInfoSidebar = ({
  question,
  onSave,
}: QuestionInfoSidebarProps) => {
  const description = question.description();
  const canWrite = question.canWrite() && !question.isArchived();

  const handleSave = (description: string | null) => {
    if (question.description() !== description) {
      onSave(question.setDescription(description));
    }
  };

  const isIAQuestion = useMemo(
    () => isInstanceAnalyticsCollection(question.collection()),
    [question],
  );

  const dispatch = useDispatch();
  const handleClose = () => dispatch(onCloseQuestionInfo());

  const [isOpen, setIsOpen] = useState(false);

  useMount(() => {
    // this component is not rendered until it is "open"
    // but we want to set isOpen after it mounts to get
    // pretty animations
    setIsOpen(true);
  });

  return (
    <Sidesheet
      title={t`Info`}
      onClose={handleClose}
      isOpen={isOpen}
      removeBodyPadding
      data-testid="question-info-sidebar"
      size="md"
    >
      <Tabs
        defaultValue="overview"
        className={SidesheetStyles.FlexScrollContainer}
      >
        <Tabs.List mx="xl">
          <Tabs.Tab value="overview">{t`Overview`}</Tabs.Tab>
          {!isIAQuestion && <Tabs.Tab value="history">{t`History`}</Tabs.Tab>}
          <PLUGIN_AUDIT.InsightsTabOrLink question={question} />
        </Tabs.List>

        <SidesheetTabPanelContainer>
          <Tabs.Panel value="overview">
            <Stack spacing="lg">
              <SidesheetCard pb="md">
                <Stack spacing="sm">
                  <Title lh={1} size="sm" color="text-light" pb={0}>
                    {t`Description`}
                  </Title>
                  <SidesheetEditableDescription
                    description={description}
                    onChange={handleSave}
                    canWrite={canWrite}
                  />
                  <PLUGIN_MODERATION.ModerationReviewText question={question} />
                  {question.type() === "model" && !question.isArchived() && (
                    <Box
                      component={Link}
                      variant="brand"
                      to={Urls.modelDetail(question.card())}
                      pt="xs"
                      pb="sm"
                    >{t`See more about this model`}</Box>
                  )}
                </Stack>
              </SidesheetCard>
              <SidesheetCard>
                <QuestionDetails question={question} />
              </SidesheetCard>
              <EntityIdCard entityId={question._card.entity_id} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="history">
            <SidesheetCard>
              <QuestionActivityTimeline question={question} />
            </SidesheetCard>
          </Tabs.Panel>
          <Tabs.Panel value="insights">
            <InsightsUpsellTab model="question" />
          </Tabs.Panel>
        </SidesheetTabPanelContainer>
      </Tabs>
    </Sidesheet>
  );
};
