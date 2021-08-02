import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import ClampedText from "metabase/components/ClampedText";
import { TextButton } from "metabase/components/Button.styled";

ClampedDescription.propTypes = {
  className: PropTypes.string,
  description: PropTypes.string,
  onEdit: PropTypes.func,
};

export function ClampedDescription({ className, description, onEdit }) {
  if (!description && !onEdit) {
    return null;
  }

  return (
    <div className={className}>
      {description ? (
        <ClampedText text={description} visibleLines={8} />
      ) : (
        <TextButton onClick={onEdit}>{t`Add a description`}</TextButton>
      )}
    </div>
  );
}
