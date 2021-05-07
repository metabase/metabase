import React from "react";
import PropTypes from "prop-types";
import { ngettext, msgid } from "ttag";
import cx from "classnames";

import { getOpenIssues } from "metabase-enterprise/moderation";

import Button from "metabase/components/Button";

OpenModerationIssuesButton.propTypes = {
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired,
};

export function OpenModerationIssuesButton({ className, onClick }) {
  const numOpenIssues = getOpenIssues().length;
  return numOpenIssues > 0 ? (
    <Button
      borderless
      className={cx(className, "text-brand text-brand-hover align-center")}
      onClick={onClick}
    >
      {ngettext(
        msgid`${numOpenIssues} open issue`,
        `${numOpenIssues} open issues`,
        numOpenIssues,
      )}
    </Button>
  ) : null;
}
