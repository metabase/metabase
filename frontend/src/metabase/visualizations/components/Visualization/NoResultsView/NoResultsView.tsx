import { t } from "ttag";

import { NoDataError } from "metabase/components/errors/NoDataError";
import Tooltip from "metabase/core/components/Tooltip";

import { Root, ShortMessage } from "./NoResultsView.styled";

interface NoResultsViewProps {
  isSmall?: boolean;
}

function NoResultsView({ isSmall }: NoResultsViewProps) {
  return (
    <Root>
      <Tooltip tooltip={t`No results!`} isEnabled={isSmall}>
        <NoDataError data-testid="no-results-image" mb="1rem" />
      </Tooltip>
      {!isSmall && <ShortMessage>{t`No results!`}</ShortMessage>}
    </Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NoResultsView;
