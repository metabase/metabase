import React from "react";
import PropTypes from "prop-types";
import styled from "styled-components";
import Radio, { optionShape } from "metabase/components/Radio";

const StyledRadio = styled(Radio)`
  font-weight: bold;
`;

const propTypes = {
  field: PropTypes.object.isRequired,
  options: PropTypes.arrayOf(optionShape).isRequired,
};

function FormRadioWidget({ field, options }) {
  return <StyledRadio showButtons vertical {...field} options={options} />;
}

FormRadioWidget.propTypes = propTypes;

export default FormRadioWidget;
