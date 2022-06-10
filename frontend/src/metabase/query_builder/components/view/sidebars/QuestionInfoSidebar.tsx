import React from "react";

import { PLUGIN_MODERATION, PLUGIN_MODEL_PERSISTENCE } from "metabase/plugins";

import EditableText from "../../EditableText";
import QuestionActivityTimeline from "metabase/query_builder/components/QuestionActivityTimeline";
import Question from "metabase-lib/lib/Question";
import { Card } from "metabase-types/types/Card";

import { Root, ContentSection } from "./QuestionInfoSidebar.styled";

interface Props {
  question: Question;
  onSave: (card: Card) => void;
}

export const QuestionInfoSidebar = ({ question, onSave }: Props) => {
  const description = question.description();
  const isDataset = question.isDataset();
  const isPersisted = isDataset && question.isPersisted();

  const handleSave = (description: string) => {
    if (question.description() !== description) {
      onSave({
        ...question.card(),
        description,
      });
    }
  };

  return (
    <Root>
      <ContentSection>
        <EditableText initialValue={description} onChange={handleSave} />
        <PLUGIN_MODERATION.QuestionModerationSection question={question} />
      </ContentSection>

      {isPersisted && (
        <ContentSection extraPadding>
          <PLUGIN_MODEL_PERSISTENCE.ModelCacheManagementSection
            model={question}
          />
        </ContentSection>
      )}
      <ContentSection extraPadding>
        <QuestionActivityTimeline question={question} />
      </ContentSection>
    </Root>
  );
};
