import { t } from "ttag";

import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { Box, Tooltip } from "metabase/ui";

import { StateView } from "../StateView";

interface NoResultsViewProps {
  isSmall?: boolean;
}

function NoResultsView({ isSmall }: NoResultsViewProps) {
  return (
    <StateView c="text-disabled">
      <Tooltip label={t`No results`} disabled={!isSmall}>
        <span>
          <NoDataError data-testid="no-results-image" mb="1rem" />
        </span>
      </Tooltip>
      {!isSmall && (
        <Box component="span" fw="bold" fz="1.12em">
          {t`No results`}
        </Box>
      )}
    </StateView>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NoResultsView;
