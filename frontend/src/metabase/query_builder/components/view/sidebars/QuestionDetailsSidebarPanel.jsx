import React from "react";
import PropTypes from "prop-types";

import QuestionActionButtons from "metabase/query_builder/components/QuestionActionButtons";
import { ClampedDescription } from "metabase/query_builder/components/ClampedDescription";
import QuestionActivityTimeline from "metabase/query_builder/components/QuestionActivityTimeline";

import { PLUGIN_MODERATION } from "metabase/plugins";

import {
  Container,
  BorderedSectionContainer,
  SidebarPaddedContent,
  ModerationSectionContainer,
} from "./QuestionDetailsSidebarPanel.styled";
import DatasetManagementSection from "./DatasetManagementSection";

QuestionDetailsSidebarPanel.propTypes = {
  question: PropTypes.object.isRequired,
  onOpenModal: PropTypes.func.isRequired,
  isBookmarked: PropTypes.bool.isRequired,
  toggleBookmark: PropTypes.func.isRequired,
};

function QuestionDetailsSidebarPanel({
  question,
  onOpenModal,
  isBookmarked,
  toggleBookmark,
}) {
  const isDataset = question.isDataset();
  const canWrite = question.canWrite();
  const description = question.description();

  const onDescriptionEdit = canWrite
    ? () => {
        onOpenModal("edit");
      }
    : undefined;

  const hasSecondarySection =
    (isDataset && canWrite) || (!isDataset && PLUGIN_MODERATION.isEnabled());

  return (
    <Container>
      <SidebarPaddedContent>
        <QuestionActionButtons
          question={question}
          canWrite={canWrite}
          onOpenModal={onOpenModal}
          isBookmarked={isBookmarked}
          toggleBookmark={toggleBookmark}
        />
        <ClampedDescription
          visibleLines={8}
          description={description}
          onEdit={onDescriptionEdit}
        />
        {hasSecondarySection && (
          <BorderedSectionContainer>
            {isDataset && canWrite && (
              <DatasetManagementSection dataset={question} />
            )}
            {!isDataset && (
              <ModerationSectionContainer>
                <PLUGIN_MODERATION.QuestionModerationSection
                  question={question}
                />
              </ModerationSectionContainer>
            )}
          </BorderedSectionContainer>
        )}
      </SidebarPaddedContent>
      <QuestionActivityTimeline question={question} />
    </Container>
  );
}

export default QuestionDetailsSidebarPanel;
