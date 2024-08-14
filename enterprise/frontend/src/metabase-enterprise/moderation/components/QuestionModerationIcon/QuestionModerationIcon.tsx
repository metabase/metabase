import type Question from "metabase-lib/v1/Question";

import ModerationReviewIcon from "../../containers/ModerationReviewIcon";
import { getLatestModerationReview } from "../../service";

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
