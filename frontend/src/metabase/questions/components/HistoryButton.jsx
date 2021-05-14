import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import moment from "moment";
import { t } from "ttag";
import Revision from "metabase/entities/revisions";
import Link from "metabase/components/Link";

function HistoryButton({ onClick, revisions }) {
  const mostRecentRevision = _.first(revisions);
  return mostRecentRevision ? (
    <Link
      className="pl1 text-bold text-light text-small text-brand-hover"
      onClick={onClick}
    >
      {t`Edited ${moment(mostRecentRevision.timestamp).fromNow()}`}
    </Link>
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
  onClick: PropTypes.func.isRequired,
  revisions: PropTypes.array,
};
