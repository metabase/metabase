import type Question from "metabase-lib/v1/Question";

import ModerationReviewIcon from "../../containers/ModerationReviewIcon";
import { getLatestModerationReview } from "../../service";

import {
  entityIsDashboard,
  ModerationReview,
  type Dashboard,
} from "metabase-types/api";

export interface QuestionModerationIconProps {
  question: Question | Dashboard;
}

const QuestionModerationIcon = ({
  question: entity,
}: QuestionModerationIconProps): JSX.Element | null => {
  const entityReviews = entityIsDashboard(entity)
    ? entity.moderation_reviews
    : (entity.getModerationReviews() as ModerationReview[]);

  const review = getLatestModerationReview(entityReviews);

  if (review) {
    return <ModerationReviewIcon review={review} />;
  } else {
    return null;
  }
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default QuestionModerationIcon;
