import { useHotkeys } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/collections/utils";
import { EntityIdCard } from "metabase/common/components/EntityIdCard";
import { Link } from "metabase/common/components/Link";
import {
  Sidesheet,
  SidesheetCard,
  SidesheetCardTitle,
  SidesheetTabPanelContainer,
} from "metabase/common/components/Sidesheet";
import { InsightsTabOrLink } from "metabase/common/components/Sidesheet/components/InsightsTabOrLink";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import SidesheetStyles from "metabase/common/components/Sidesheet/sidesheet.module.css";
import { InsightsUpsellTab } from "metabase/dashboard/components/DashboardInfoSidebar/components/InsightsUpsellTab";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { onCloseQuestionInfo } from "metabase/query_builder/actions";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";
import { Flex, Icon, Stack, Tabs } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { QuestionDetails } from "./QuestionDetails";
import { QuestionRelationshipsTab } from "./components/QuestionRelationshipsTab";
import { SidesheetCardWithFields } from "./components/SidesheetCardWithFields";

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

  useHotkeys([["]", handleClose]]);

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
          <Tabs.Tab value="relationships">{t`Relationships`}</Tabs.Tab>
          {question.type() === "model" && !question.isArchived() && (
            <Link to={Urls.modelDetail(question.card())}>
              <Flex gap="xs" className={SidesheetStyles.TabSibling}>
                <Icon name="external" />
                {t`Actions`}
              </Flex>
            </Link>
          )}
          <InsightsTabOrLink question={question} />
        </Tabs.List>

        <SidesheetTabPanelContainer>
          <Tabs.Panel value="overview">
            <Stack gap="lg">
              <SidesheetCard pb="md">
                <Stack gap={0}>
                  <SidesheetCardTitle>{t`Description`}</SidesheetCardTitle>

                  <Stack gap="sm">
                    <SidesheetEditableDescription
                      description={description}
                      onChange={handleSave}
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
              <SidesheetCardWithFields question={question} />
              <EntityIdCard entityId={question._card.entity_id} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="relationships">
            <QuestionRelationshipsTab question={question} />
          </Tabs.Panel>
          <Tabs.Panel value="history">
            <SidesheetCard>
              <QuestionActivityTimeline question={question} />
            </SidesheetCard>
          </Tabs.Panel>
          <Tabs.Panel value="insights">
            <InsightsUpsellTab model={question.type()} />
          </Tabs.Panel>
        </SidesheetTabPanelContainer>
      </Tabs>
    </Sidesheet>
  );
};
