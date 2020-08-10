import React from "react";
import PropTypes from "prop-types";

import ItemPicker from "./ItemPicker";

const QuestionPicker = ({ value, onChange, maxHeight, ...props }) => (
  <ItemPicker
    {...props}
    // maxHeight is set when rendered in a popover
    style={maxHeight != null ? { maxHeight } : {}}
    value={value === undefined ? undefined : { model: "card", id: value }}
    onChange={question => onChange(question ? question.id : undefined)}
    models={["card"]}
  />
);

QuestionPicker.propTypes = {
  // a question ID or null
  value: PropTypes.number,
  // callback that takes a question ID
  onChange: PropTypes.func.isRequired,
};

export default QuestionPicker;
