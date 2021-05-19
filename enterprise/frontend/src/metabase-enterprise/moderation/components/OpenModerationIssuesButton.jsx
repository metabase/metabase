import React from "react";
import PropTypes from "prop-types";
import { ngettext, msgid } from "ttag";
import cx from "classnames";

import Button from "metabase/components/Button";

OpenModerationIssuesButton.propTypes = {
  numOpenIssues: PropTypes.number.isRequired,
  className: PropTypes.string,
  onClick: PropTypes.func.isRequired,
};

export function OpenModerationIssuesButton({
  numOpenIssues,
  className,
  onClick,
}) {
  return numOpenIssues > 0 ? (
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
  ) : null;
}
