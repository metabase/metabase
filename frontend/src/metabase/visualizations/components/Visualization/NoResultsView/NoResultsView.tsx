import { t } from "ttag";

import { NoDataError } from "metabase/common/components/errors/NoDataError";
import { Box, Tooltip } from "metabase/ui";
import { NoResultsMessage } from "metabase/visualizations/components/NoResultsMessage";

import { StateView } from "../StateView";

interface NoResultsViewProps {
  isSmall?: boolean;
  message?: string;
}

function NoResultsView({ isSmall, message }: NoResultsViewProps) {
  // The illustration is left out of a custom message: it is the app's own
  // no-data state and could contradict the author. The view shrinks with the
  // card so a long message clips instead of overflowing it.
  if (message) {
    return (
      <StateView flex="1 1 auto" mih={0} px="lg">
        {/* Remounting on edit re-measures clipping when the card size is unchanged. */}
        <NoResultsMessage key={message} message={message} isCompact={isSmall} />
      </StateView>
    );
  }

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
