import React from "react";
import Question from "metabase-lib/Question";
import { getLatestModerationReview } from "../../service";
import ModerationReviewIcon from "../../containers/ModerationReviewIcon";

export interface QuestionModerationIconProps {
  question: Question;
}

const QuestionModerationIcon = ({
  question,
}: QuestionModerationIconProps): JSX.Element | null => {
  const review = getLatestModerationReview(question.getModerationReviews());

  if (review) {
    return <ModerationReviewIcon review={review} />;
  } else {
    return null;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionModerationIcon;
