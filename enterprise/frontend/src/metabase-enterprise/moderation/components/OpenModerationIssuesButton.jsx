import React from "react";
import PropTypes from "prop-types";
import { ngettext, msgid } from "ttag";
import cx from "classnames";
import { getNumberOfOpenRequests } from "metabase-enterprise/moderation";

import Button from "metabase/components/Button";

OpenModerationIssuesButton.propTypes = {
  question: PropTypes.object.isRequired,
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired,
};

export function OpenModerationIssuesButton({ question, className, onClick }) {
  const numOpenIssues = getNumberOfOpenRequests(question);
  return (
    <Button
      borderless
      className={cx(className, "py1 text-brand text-brand-hover align-center")}
      onClick={onClick}
    >
      {ngettext(
        msgid`${numOpenIssues} open issue`,
        `${numOpenIssues} open issues`,
        numOpenIssues,
      )}
    </Button>
  );
}
