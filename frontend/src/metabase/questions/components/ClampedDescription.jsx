import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ClampedText from "metabase/components/ClampedText";
import Button from "metabase/components/Button";

ClampedDescription.propTypes = {
  className: PropTypes.string,
  description: PropTypes.string,
  onEdit: PropTypes.func.isRequired,
};

export function ClampedDescription({ className, description, onEdit }) {
  return (
    <div className={className}>
      {description ? (
        <ClampedText text={description} visibleLines={8} />
      ) : (
        <Button
          onClick={onEdit}
          link
          className="text-medium p0 py1 bg-transparent bg-transparent-hover borderless text-underline-hover"
        >{t`Add a description`}</Button>
      )}
    </div>
  );
}
