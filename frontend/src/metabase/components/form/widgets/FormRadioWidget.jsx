import React from "react";
import PropTypes from "prop-types";
import styled from "@emotion/styled";
import { Radio } from "metabase/core/components/Radio";

const StyledRadio = styled(Radio)`
  font-weight: bold;
`;

const propTypes = {
  field: PropTypes.object.isRequired,
  options: PropTypes.array.isRequired,
};

function FormRadioWidget({ field, options }) {
  return <StyledRadio showButtons vertical {...field} options={options} />;
}

FormRadioWidget.propTypes = propTypes;

export default FormRadioWidget;
