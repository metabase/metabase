import { useState } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  Sidesheet,
  SidesheetCard,
  SidesheetSubPage,
  SidesheetTabPanelContainer,
} from "metabase/common/components/Sidesheet";
import SidesheetStyles from "metabase/common/components/Sidesheet/sidesheet.module.css";
import EditableText from "metabase/core/components/EditableText";
import Link from "metabase/core/components/Link";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_CACHING, PLUGIN_MODERATION } from "metabase/plugins";
import { onCloseQuestionInfo } from "metabase/query_builder/actions";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";
import { Stack, Tabs } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import ModelCacheManagementSection from "../ModelCacheManagementSection";

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
  const isPersisted = question.isPersisted();
  const hasCacheSection =
    PLUGIN_CACHING.hasQuestionCacheSection(question) &&
    PLUGIN_CACHING.isGranularCachingEnabled();

  const handleSave = (description: string | null) => {
    if (question.description() !== description) {
      onSave(question.setDescription(description));
    }
  };

  const dispatch = useDispatch();
  const handleClose = () => dispatch(onCloseQuestionInfo());

  const [page, setPage] = useState<"default" | "caching">("default");
  const [isOpen, setIsOpen] = useState(false);

  useMount(() => {
    // this component is not rendered until it is "open"
    // but we want to set isOpen after it mounts to get
    // pretty animations
    setIsOpen(true);
  });

  if (page === "caching") {
    return (
      <SidesheetSubPage
        isOpen
        title={t`Cache settings`}
        onBack={() => setPage("default")}
        onClose={handleClose}
      >
        <PLUGIN_CACHING.SidebarCacheForm
          item={question}
          model="question"
          onClose={handleClose}
          pt="md"
        />
      </SidesheetSubPage>
    );
  }

  return (
    <Sidesheet
      title={t`Info`}
      onClose={handleClose}
      isOpen={isOpen}
      removeBodyPadding
    >
      <Tabs
        defaultValue="overview"
        className={SidesheetStyles.FlexScrollContainer}
      >
        <Tabs.List mx="lg">
          <Tabs.Tab value="overview">{t`Overview`}</Tabs.Tab>
          <Tabs.Tab value="history">{t`History`}</Tabs.Tab>
        </Tabs.List>
        <SidesheetTabPanelContainer>
          <Tabs.Panel value="overview">
            <Stack spacing="lg">
              <SidesheetCard title={t`Description`}>
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
                <PLUGIN_MODERATION.ModerationReviewText question={question} />
                {question.type() === "model" && !question.isArchived() && (
                  <Link
                    variant="brand"
                    to={Urls.modelDetail(question.card())}
                  >{t`See more about this model`}</Link>
                )}
              </SidesheetCard>

              {question.type() === "model" && isPersisted && (
                <SidesheetCard>
                  <ModelCacheManagementSection model={question} />
                </SidesheetCard>
              )}

              {hasCacheSection && (
                <SidesheetCard>
                  <Stack spacing="0.5rem">
                    <PLUGIN_CACHING.SidebarCacheSection
                      model="question"
                      item={question}
                      setPage={setPage}
                    />
                  </Stack>
                </SidesheetCard>
              )}
            </Stack>
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
