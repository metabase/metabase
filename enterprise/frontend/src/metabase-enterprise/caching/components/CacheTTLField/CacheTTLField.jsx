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

function CacheTTLField({ field, message, ...props }) {
  const hasError = !!field.error;
  return (
    <CacheTTLFieldContainer {...props} data-testid="cache-ttl-field">
      {message && (
        <FieldText margin="right" hasError={hasError}>
          {message}
        </FieldText>
      )}
      <Input
        aria-labelledby={`${field.name}-label`}
        {...formDomOnlyProps(field)}
        value={field.value}
        placeholder="24"
        hasError={hasError}
        data-testid="cache-ttl-input"
      />
      <FieldText margin="left" hasError={hasError}>{t`hours`}</FieldText>
    </CacheTTLFieldContainer>
  );
}

CacheTTLField.propTypes = propTypes;

export default CacheTTLField;
