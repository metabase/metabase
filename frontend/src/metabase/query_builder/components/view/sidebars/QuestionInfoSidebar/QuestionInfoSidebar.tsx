import { t } from "ttag";

import EditableText from "metabase/core/components/EditableText";
import Link from "metabase/core/components/Link";
import * as Urls from "metabase/lib/urls";
import { PLUGIN_MODERATION, PLUGIN_CACHING } from "metabase/plugins";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";
import type Question from "metabase-lib/v1/Question";

import ModelCacheManagementSection from "../ModelCacheManagementSection";

import {
  Root,
  ContentSection,
  HeaderContainer,
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

  const handleUpdateCacheTTL = (cache_ttl: number | undefined) => {
    if (question.cacheTTL() !== cache_ttl) {
      return onSave(question.setCacheTTL(cache_ttl));
    }
  };

  return (
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
          <PLUGIN_CACHING.QuestionCacheSection
            question={question}
            onSave={handleUpdateCacheTTL}
          />
        </ContentSection>
      )}
      <ContentSection extraPadding>
        <QuestionActivityTimeline question={question} />
      </ContentSection>
    </Root>
  );
};
