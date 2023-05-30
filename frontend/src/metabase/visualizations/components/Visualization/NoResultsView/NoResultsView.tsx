import React from "react";
import { t } from "ttag";

import { Tooltip } from "metabase/core/components/Tooltip";

import NoResults from "assets/img/no_results.svg";
import { Root, ShortMessage } from "./NoResultsView.styled";

interface NoResultsViewProps {
  isSmall?: boolean;
}

function NoResultsView({ isSmall }: NoResultsViewProps) {
  return (
    <Root>
      <Tooltip tooltip={t`No results!`} isEnabled={isSmall}>
        <img data-testid="no-results-image" src={NoResults} />
      </Tooltip>
      {!isSmall && <ShortMessage>{t`No results!`}</ShortMessage>}
    </Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NoResultsView;
