import React from "react";
import { t } from "ttag";

import { PLUGIN_MODERATION, PLUGIN_CACHING } from "metabase/plugins";

import MetabaseSettings from "metabase/lib/settings";

import QuestionActivityTimeline from "metabase/query_builder/components/QuestionActivityTimeline";

import Question from "metabase-lib/lib/Question";
import { Card } from "metabase-types/types/Card";

import EditableText from "metabase/core/components/EditableText";

import ModelCacheManagementSection from "./ModelCacheManagementSection";
import { Root, ContentSection, Header } from "./QuestionInfoSidebar.styled";

interface QuestionInfoSidebarProps {
  question: Question;
  onSave: (card: Card) => Promise<Question>;
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
      onSave(question.setDescription(description).card());
    }
  };

  const handleUpdateCacheTTL = (cache_ttl: number | undefined) => {
    if (question.cacheTTL() !== cache_ttl) {
      return onSave(question.setCacheTTL(cache_ttl).card());
    }
  };

  return (
    <Root>
      <ContentSection>
        <Header>{t`About`}</Header>
        <EditableText
          initialValue={description}
          placeholder={
            !description && !canWrite ? t`No description` : t`Add description`
          }
          isOptional
          isMultiline
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
