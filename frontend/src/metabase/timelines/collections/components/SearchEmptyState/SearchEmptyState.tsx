import { t } from "ttag";

import EmptyFolder from "assets/img/empty-states/collection.svg";
import { Box, Stack, Text } from "metabase/ui";

export interface SearchEmptyStateProps {
  isTimeline?: boolean;
}

const SearchEmptyState = ({
  isTimeline,
}: SearchEmptyStateProps): JSX.Element => {
  return (
    <Stack align="center" gap="md">
      <Box maw="6rem">
        <img src={EmptyFolder} alt={t`Empty folder illustration`} />
      </Box>
      <Text fz="md" maw="25rem" c="text-secondary">
        {isTimeline ? t`No timelines found` : t`No events found`}
      </Text>
    </Stack>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SearchEmptyState;
