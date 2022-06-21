import React from "react";

import {
  PLUGIN_MODERATION,
  PLUGIN_MODEL_PERSISTENCE,
  PLUGIN_CACHING,
} from "metabase/plugins";

import MetabaseSettings from "metabase/lib/settings";

import QuestionActivityTimeline from "metabase/query_builder/components/QuestionActivityTimeline";

import Question from "metabase-lib/lib/Question";
import { Card } from "metabase-types/types/Card";

import EditableText from "../../EditableText";
import { Root, ContentSection } from "./QuestionInfoSidebar.styled";

interface QuestionInfoSidebarProps {
  question: Question;
  onSave: (card: Card) => Promise<Question>;
}

export const QuestionInfoSidebar = ({
  question,
  onSave,
}: QuestionInfoSidebarProps) => {
  const description = question.description();
  const isDataset = question.isDataset();
  const isPersisted = isDataset && question.isPersisted();

  const showCaching =
    PLUGIN_CACHING.isEnabled() && MetabaseSettings.get("enable-query-caching");

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
        <EditableText
          initialValue={description}
          onChange={handleSave}
          placeholder="Description"
        />
        <PLUGIN_MODERATION.QuestionModerationSection question={question} />
      </ContentSection>

      {isPersisted && (
        <ContentSection extraPadding>
          <PLUGIN_MODEL_PERSISTENCE.ModelCacheManagementSection
            model={question}
          />
        </ContentSection>
      )}

      {showCaching && (
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
