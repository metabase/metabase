import React from "react";
import PropTypes from "prop-types";
import _ from "underscore";
import moment from "moment";
import { t } from "ttag";
import Revision from "metabase/entities/revisions";
import Button from "metabase/components/Button";

function HistoryButton({ onClick, revisions }) {
  const mostRecentRevision = _.first(revisions);
  return mostRecentRevision ? (
    <Button
      className="text-underline text-light"
      borderless
      small
      onClick={onClick}
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
  onClick: PropTypes.func.isRequired,
  revisions: PropTypes.array,
};
