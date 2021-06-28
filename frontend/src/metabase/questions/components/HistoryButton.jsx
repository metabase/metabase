import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import moment from "moment";
import { t } from "ttag";
import cx from "classnames";

import Revision from "metabase/entities/revisions";
import Button from "metabase/components/Button";

function HistoryButton({ className, onClick, revisions }) {
  const mostRecentRevision = _.first(revisions);
  return mostRecentRevision ? (
    <Button
      className={cx(
        className,
        "p0 borderless text-bold text-light text-small text-brand-hover bg-transparent-hover",
      )}
      onClick={onClick}
      data-testid="history-button"
    >
      {t`Edited ${moment(mostRecentRevision.timestamp).fromNow()}`}
    </Button>
  ) : null;
}

export default Revision.loadList({
  query: (state, props) => ({
    model_type: props.modelType,
    model_id: props.modelId,
  }),
  loadingAndErrorWrapper: false,
  wrapped: true,
})(HistoryButton);

HistoryButton.propTypes = {
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired,
  revisions: PropTypes.array,
};
