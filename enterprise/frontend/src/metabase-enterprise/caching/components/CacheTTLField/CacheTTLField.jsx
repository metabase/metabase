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
  }),
  message: PropTypes.string,
};

export function CacheTTLField({ field, message }) {
  return (
    <CacheTTLFieldContainer>
      {message && <FieldText margin="right">{message}</FieldText>}
      <Input
        aria-labelledby={`${field.name}-label`}
        {...formDomOnlyProps(field)}
        value={field.value || 0}
      />
      <FieldText margin="left">{t`hours`}</FieldText>
    </CacheTTLFieldContainer>
  );
}

CacheTTLField.propTypes = propTypes;
