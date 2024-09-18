import { useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import { CommentFeed } from "metabase/comments";
import {
  Sidesheet,
  SidesheetCard,
  SidesheetTabPanelContainer,
} from "metabase/common/components/Sidesheet";
import SidesheetStyles from "metabase/common/components/Sidesheet/sidesheet.module.css";
import { EntityIdCard } from "metabase/components/EntityIdCard";
import EditableText from "metabase/core/components/EditableText";
import Link from "metabase/core/components/Link";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { onCloseQuestionInfo } from "metabase/query_builder/actions";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";
import { Stack, Tabs } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import { QuestionDetails } from "./QuestionDetails";
import Styles from "./QuestionInfoSidebar.module.css";

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
    >
      <Tabs
        defaultValue="comments"
        className={SidesheetStyles.FlexScrollContainer}
      >
        <Tabs.List mx="lg">
          <Tabs.Tab value="overview">{t`Overview`}</Tabs.Tab>
          <Tabs.Tab value="comments">{t`Comments`}</Tabs.Tab>
          <Tabs.Tab value="history">{t`History`}</Tabs.Tab>
        </Tabs.List>
        <SidesheetTabPanelContainer>
          <Tabs.Panel value="overview">
            <Stack spacing="lg">
              <SidesheetCard title={t`Description`}>
                <div className={Styles.EditableTextContainer}>
                  <EditableText
                    initialValue={description}
                    placeholder={
                      !description && !canWrite
                        ? t`No description`
                        : t`Add description`
                    }
                    isOptional
                    isMultiline
                    isMarkdown
                    isDisabled={!canWrite}
                    onChange={handleSave}
                  />
                </div>
                <PLUGIN_MODERATION.ModerationReviewText question={question} />
                {question.type() === "model" && !question.isArchived() && (
                  <Link
                    variant="brand"
                    to={Urls.modelDetail(question.card())}
                  >{t`See more about this model`}</Link>
                )}
              </SidesheetCard>
              <SidesheetCard>
                <QuestionDetails question={question} />
              </SidesheetCard>
              <EntityIdCard entityId={question._card.entity_id} />
            </Stack>
          </Tabs.Panel>
          <Tabs.Panel value="comments">
            <CommentFeed model="question" modelId={question.id} />
          </Tabs.Panel>
          <Tabs.Panel value="history">
            <SidesheetCard>
              <QuestionActivityTimeline question={question} />
            </SidesheetCard>
          </Tabs.Panel>
        </SidesheetTabPanelContainer>
      </Tabs>
    </Sidesheet>
  );
};
