import { type Dispatch, type SetStateAction, useRef, useState } from "react";
import { match } from "ts-pattern";
import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";
import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_CACHING, PLUGIN_MODERATION } from "metabase/plugins";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";
import { Button, Flex, Icon, Stack, Textarea, Tooltip } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import ModelCacheManagementSection from "../ModelCacheManagementSection";

import { EditVizPage } from "./EditVizPage";
import {
  ContentSection,
  HeaderContainer,
  Root,
} from "./QuestionInfoSidebar.styled";

interface QuestionInfoSidebarProps {
  question: Question;
  onSave: (question: Question) => Promise<Question>;
}

type AnalysisPageId = "default" | "describe" | "caching" | "edit_viz";

export const QuestionInfoSidebar = ({
  question,
  onSave,
}: QuestionInfoSidebarProps) => {
  const [pageId, setPageId] = useState<AnalysisPageId>("edit_viz");
  const scrollableStackRef = useRef<HTMLDivElement | null>(null);

  const page = match(pageId)
    .with("default", () => (
      <DefaultPage question={question} onSave={onSave} setPageId={setPageId} />
    ))
    .with("describe", () => <DescribePage />)
    .with("edit_viz", () => (
      <EditVizPage
        question={question}
        scrollableStackRef={scrollableStackRef}
      />
    ))
    .with("caching", () => (
      <CachingPage question={question} setPage={setPageId} />
    ))
    .otherwise(() => null);

  return (
    <>
      <Root>
        <ContentSection style={{ height: "100%", overflowY: "hidden" }}>
          <Stack
            spacing="md"
            h="100%"
            style={{
              padding: "0rem",
              overflowY: "auto",
            }}
            ref={scrollableStackRef}
          >
            <Flex gap="sm" p="1rem">
              <Button onClick={() => setPageId("default")}>
                <Icon name="info" />
              </Button>
              <Button onClick={() => setPageId("describe")}>
                <Icon name="gear" />
              </Button>
              <Tooltip label={t`Edit visualization with AI`}>
                <Button onClick={() => setPageId("edit_viz")}>
                  <Icon name="palette" />
                </Button>
              </Tooltip>
            </Flex>
            {page}
          </Stack>
        </ContentSection>
      </Root>
    </>
  );
};

const DescribePage = () => {
  return (
    <Stack p="md">
      <Textarea
        autosize
        rows={1}
        maxRows={4}
        placeholder={t`Describe yourself and your goals`}
        id="user-description"
      />
    </Stack>
  );
};

const DefaultPage = ({
  question,
  onSave,
  setPageId,
}: {
  question: Question;
  onSave: (question: Question) => Promise<Question>;
  setPageId: Dispatch<SetStateAction<AnalysisPageId>>;
}) => {
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

  return (
    <Stack p="lg">
      <Root>
        <ContentSection>
          <HeaderContainer>
            <h3>{t`About`}</h3>
            {question.type() === "model" && !question.isArchived() && (
              <Link
                variant="brand"
                to={Urls.modelDetail(question.card())}
              >{t`Model details`}</Link>
            )}
          </HeaderContainer>
          <EditableText
            initialValue={description}
            placeholder={
              !description && !canWrite ? t`No description` : t`Add description`
            }
            isOptional
            isMultiline
            isMarkdown
            isDisabled={!canWrite}
            onChange={handleSave}
          />
          <PLUGIN_MODERATION.QuestionModerationSection question={question} />
        </ContentSection>

        {question.type() === "model" && isPersisted && (
          <ContentSection extraPadding>
            <ModelCacheManagementSection model={question} />
          </ContentSection>
        )}

        {hasCacheSection && (
          <ContentSection extraPadding>
            <Stack spacing="0.5rem">
              <PLUGIN_CACHING.SidebarCacheSection
                model="question"
                item={question}
                setPage={setPageId}
              />
            </Stack>
          </ContentSection>
        )}
        <ContentSection extraPadding>
          <QuestionActivityTimeline question={question} />
        </ContentSection>
      </Root>
    </Stack>
  );
};

const CachingPage = ({
  question,
  setPage,
}: {
  question: Question;
  setPage: Dispatch<SetStateAction<AnalysisPageId>>;
}) => (
  <PLUGIN_CACHING.SidebarCacheForm
    item={question}
    model="question"
    setPage={setPage}
    pt="md"
  />
);
