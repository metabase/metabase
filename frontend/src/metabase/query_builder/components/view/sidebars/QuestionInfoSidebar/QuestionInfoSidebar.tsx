import { useHotkeys } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { useMount } from "react-use";
import { match } from "ts-pattern";
import { t } from "ttag";

import { isInstanceAnalyticsCollection } from "metabase/common/collections/utils";
import {
  SIDEBAR_WIDTH,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { EntityIdFooter } from "metabase/common/components/EntityIdCard";
import { Link } from "metabase/common/components/Link";
import { Sidesheet } from "metabase/common/components/Sidesheet";
import { SidesheetEditableDescription } from "metabase/common/components/Sidesheet/components/SidesheetEditableDescription";
import { InsightsAction } from "metabase/common/components/upsells/components/InsightsAction";
import { PLUGIN_MODERATION } from "metabase/plugins";
import { useDispatch } from "metabase/redux";
import { ActionIcon, Box, Icon, Stack, Tooltip } from "metabase/ui";
import * as Urls from "metabase/urls";
import type Question from "metabase-lib/v1/Question";

import { onCloseQuestionInfo } from "../../../../store/actions";
import { QuestionActivityTimeline } from "../../../QuestionActivityTimeline";

import { QuestionDetails } from "./QuestionDetails";
import { QuestionFieldsSection } from "./components/QuestionFieldsSection";
import { QuestionRelationships } from "./components/QuestionRelationships";

interface QuestionInfoSidebarProps {
  question: Question;
  onSave: (question: Question) => Promise<void>;
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
      title={
        <Box component="span" fz="h3" lh="h3">
          {t`Info`}
        </Box>
      }
      onClose={handleClose}
      isOpen={isOpen}
      data-testid="question-info-sidebar"
      size={SIDEBAR_WIDTH}
      actions={
        <>
          {question.type() === "model" && !question.isArchived() && (
            <Tooltip label={t`Actions`}>
              <ActionIcon
                component={Link}
                to={Urls.modelDetail(question.card())}
                variant="subtle"
                size="md"
                c="text-primary"
                aria-label={t`Actions`}
              >
                <Icon name="bolt" />
              </ActionIcon>
            </Tooltip>
          )}
          <InsightsAction question={question} model={question.type()} />
        </>
      }
      footer={
        <EntityIdFooter
          items={[
            {
              label: getEntityLabel(question),
              entityId: question._card.entity_id,
            },
          ]}
        />
      }
    >
      <Stack gap="xxl">
        <SidebarSection title={t`Description`} gap={0}>
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
        </SidebarSection>
        <QuestionDetails question={question} />
        <QuestionFieldsSection question={question} />
        <QuestionRelationships question={question} />
        {!isIAQuestion && (
          <SidebarSection title={t`History`}>
            <Box bd="1px solid var(--mb-color-border-neutral)" bdrs="lg" p="sm">
              <QuestionActivityTimeline question={question} />
            </Box>
          </SidebarSection>
        )}
      </Stack>
    </Sidesheet>
  );
};

const getEntityLabel = (question: Question) =>
  match(question.type())
    .with("model", () => t`This model`)
    .with("metric", () => t`This metric`)
    .otherwise(() => t`This question`);
