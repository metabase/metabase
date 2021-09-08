import React from "react";
import PropTypes from "prop-types";
import { t } from "ttag";
import { formDomOnlyProps } from "metabase/lib/redux";
import {
  CacheTTLFieldContainer,
  FieldText,
  Input,
} from "./CacheTTLField.styled";

const propTypes = {
  field: PropTypes.shape({
    name: PropTypes.string.isRequired,
    value: PropTypes.number,
    error: PropTypes.string,
  }),
  message: PropTypes.string,
};

export function CacheTTLField({ field, message }) {
  const hasError = !!field.error;
  return (
    <CacheTTLFieldContainer>
      {message && (
        <FieldText margin="right" hasError={hasError}>
          {message}
        </FieldText>
      )}
      <Input
        aria-labelledby={`${field.name}-label`}
        {...formDomOnlyProps(field)}
        value={field.value || 0}
        hasError={hasError}
      />
      <FieldText margin="left" hasError={hasError}>{t`hours`}</FieldText>
    </CacheTTLFieldContainer>
  );
}

CacheTTLField.propTypes = propTypes;
