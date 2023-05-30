import React from "react";
import { t } from "ttag";

import { EditableText } from "metabase/core/components/EditableText";

import { PLUGIN_MODERATION, PLUGIN_CACHING } from "metabase/plugins";

import MetabaseSettings from "metabase/lib/settings";
import * as Urls from "metabase/lib/urls";

import { Link } from "metabase/core/components/Link";
import { QuestionActivityTimeline } from "metabase/query_builder/components/QuestionActivityTimeline";

import Question from "metabase-lib/Question";

import ModelCacheManagementSection from "./ModelCacheManagementSection";
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
  const isDataset = question.isDataset();
  const isPersisted = isDataset && question.isPersisted();
  const isCachingAvailable =
    !isDataset &&
    PLUGIN_CACHING.isEnabled() &&
    MetabaseSettings.get("enable-query-caching");

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
          {question.isDataset() && (
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

      {isPersisted && (
        <ContentSection extraPadding>
          <ModelCacheManagementSection model={question} />
        </ContentSection>
      )}

      {isCachingAvailable && (
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
