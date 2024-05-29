import { useState } from "react";
import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";
import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_CACHING, PLUGIN_MODERATION } from "metabase/plugins";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";
import { Stack } from "metabase/ui";
import type Question from "metabase-lib/v1/Question";

import ModelCacheManagementSection from "../ModelCacheManagementSection";

import {
  ContentSection,
  HeaderContainer,
  Root,
} from "./QuestionInfoSidebar.styled";

interface QuestionInfoSidebarProps {
  question: Question;
  onSave: (question: Question) => Promise<Question>;
}

export const QuestionInfoSidebar = ({
  question,
  onSave,
}: QuestionInfoSidebarProps) => {
  const description = question.description();
  const canWrite = question.canWrite();
  const isPersisted = question.isPersisted();
  const hasCacheSection = PLUGIN_CACHING.hasQuestionCacheSection(question);

  const handleSave = (description: string | null) => {
    if (question.description() !== description) {
      onSave(question.setDescription(description));
    }
  };

  const [page, setPage] = useState<"default" | "caching">("default");

  return (
    <>
      {page === "default" && (
        <Root>
          <ContentSection>
            <HeaderContainer>
              <h3>{t`About`}</h3>
              {question.type() === "model" && (
                <Link
                  variant="brand"
                  to={Urls.modelDetail(question.card())}
                >{t`Model details`}</Link>
              )}
            </HeaderContainer>
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
                  setPage={setPage}
                />
              </Stack>
            </ContentSection>
          )}
          <ContentSection extraPadding>
            <QuestionActivityTimeline question={question} />
          </ContentSection>
        </Root>
      )}
      {page === "caching" && (
        <PLUGIN_CACHING.SidebarCacheForm
          item={question}
          model="question"
          setPage={setPage}
          pt="md"
        />
      )}
    </>
  );
};
