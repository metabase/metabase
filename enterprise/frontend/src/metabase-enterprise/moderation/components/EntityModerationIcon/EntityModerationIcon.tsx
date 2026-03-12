import type { ModerationReview } from "metabase-types/api";

import ModerationReviewIcon from "../../containers/ModerationReviewIcon";
import { getLatestModerationReview } from "../../service";

export interface EntityModerationIconProps {
  moderationReviews?: ModerationReview[];
}

export const EntityModerationIcon = ({
  moderationReviews = [],
}: EntityModerationIconProps): JSX.Element | null => {
  const review = getLatestModerationReview(moderationReviews);

  if (review) {
    return <ModerationReviewIcon review={review} />;
  } else {
    return null;
  }
};
