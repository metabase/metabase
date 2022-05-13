import React from "react";
import PropTypes from "prop-types";

import TippyPopover from "metabase/components/Popover/TippyPopover";

import Field from "metabase-lib/lib/metadata/Field";

import {
  OptionListContainer,
  StyledFieldValuesWidget,
  FieldValuesWidgetContainer,
} from "./CategoryFieldInput.styled";

const DefaultTokenFieldLayout = ({ valuesList, optionsList, isFocused }) => (
  <TippyPopover
    visible={isFocused && !!optionsList}
    content={<OptionListContainer>{optionsList}</OptionListContainer>}
    placement="bottom-start"
  >
    <div>{valuesList}</div>
  </TippyPopover>
);

DefaultTokenFieldLayout.propTypes = {
  valuesList: PropTypes.arrayOf(PropTypes.string),
  optionsList: PropTypes.arrayOf(PropTypes.string),
  isFocused: PropTypes.bool,
};

function CategoryFieldInput({ value, field, onChange }) {
  return (
    <FieldValuesWidgetContainer>
      <StyledFieldValuesWidget
        value={value ? [String(value)] : []}
        fields={[field]}
        onChange={values => onChange(values[0])}
        multi={false}
        autoFocus={false}
        alwaysShowOptions={false}
        disableSearch={false}
        forceTokenField
        layoutRenderer={DefaultTokenFieldLayout}
        valueRenderer={value => <span>{value}</span>}
        color="brand"
        maxWidth={null}
      />
    </FieldValuesWidgetContainer>
  );
}

CategoryFieldInput.propTypes = {
  value: PropTypes.string,
  field: PropTypes.instanceOf(Field).isRequired,
  onChange: PropTypes.func.isRequired,
};

export default CategoryFieldInput;
