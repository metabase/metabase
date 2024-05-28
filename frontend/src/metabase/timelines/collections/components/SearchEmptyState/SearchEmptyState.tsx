import { t } from "ttag";

import {
  EmptyStateIcon,
  EmptyStateRoot,
  EmptyStateText,
} from "./SearchEmptyState.styled";

export interface SearchEmptyStateProps {
  isTimeline?: boolean;
}

const SearchEmptyState = ({
  isTimeline,
}: SearchEmptyStateProps): JSX.Element => {
  return (
    <EmptyStateRoot>
      <EmptyStateIcon name="star" />
      <EmptyStateText>
        {isTimeline ? t`No timelines found` : t`No events found`}
      </EmptyStateText>
    </EmptyStateRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SearchEmptyState;
