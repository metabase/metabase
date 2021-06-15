import React from "react";
import PropTypes from "prop-types";
import { ngettext, msgid, t } from "ttag";
import cx from "classnames";
import { getNumberOfOpenRequests } from "metabase-enterprise/moderation";

import Button from "metabase/components/Button";
import Tooltip from "metabase/components/Tooltip";

OpenModerationIssuesButton.propTypes = {
  question: PropTypes.object.isRequired,
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired,
};

export function OpenModerationIssuesButton({ question, className, onClick }) {
  const numOpenIssues = getNumberOfOpenRequests(question);
  return (
    <Tooltip tooltip={t`Open review requests`}>
      <Button
        borderless
        className={cx(
          className,
          "py1 align-center bg-light",
          numOpenIssues === 0 && "text-light text-light-hover bg-light-hover",
          numOpenIssues > 0 && "text-brand text-white-hover bg-brand-hover",
        )}
        onClick={onClick}
        disabled={numOpenIssues === 0}
      >
        {ngettext(msgid`${numOpenIssues}`, `${numOpenIssues}`, numOpenIssues)}
      </Button>
    </Tooltip>
  );
}
