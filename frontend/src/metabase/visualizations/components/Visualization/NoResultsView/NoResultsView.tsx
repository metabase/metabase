import { t } from "ttag";

import Tooltip from "metabase/core/components/Tooltip";
import { NoRowsError } from "metabase/query_builder/components/errors/NowRowsError";

import { Root, ShortMessage } from "./NoResultsView.styled";

interface NoResultsViewProps {
  isSmall?: boolean;
}

function NoResultsView({ isSmall }: NoResultsViewProps) {
  return (
    <Root>
      <Tooltip tooltip={t`No results!`} isEnabled={isSmall}>
        <NoRowsError mb="1rem" />
      </Tooltip>
      {!isSmall && <ShortMessage>{t`No results!`}</ShortMessage>}
    </Root>
  );
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default NoResultsView;
