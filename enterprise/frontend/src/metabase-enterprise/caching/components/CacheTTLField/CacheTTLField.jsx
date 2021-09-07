import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { formDomOnlyProps } from "metabase/lib/redux";
import NumericInput from "metabase/components/NumericInput";
import { CacheTTLFieldContainer } from "./CacheTTLField.styled";

const propTypes = {
  field: PropTypes.shape({
    name: PropTypes.string.isRequired,
    value: PropTypes.number,
  }),
  message: PropTypes.string,
};

export function CacheTTLField({ field, message }) {
  return (
    <CacheTTLFieldContainer>
      {message && <span>{message}</span>}
      <NumericInput
        aria-labelledby={`${field.name}-label`}
        {...formDomOnlyProps(field)}
        value={field.value || 0}
      />
      <span>{t`hours`}</span>
    </CacheTTLFieldContainer>
  );
}

CacheTTLField.propTypes = propTypes;
