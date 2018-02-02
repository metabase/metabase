
import React, { Component } from "react";
import TokenField from "metabase/components/TokenField";
import RemappedValue from "metabase/containers/RemappedValue"

export default class FieldValuesWidget extends Component {
  onInputChange = (value) => {
    return value;
  }

  render() {
    const { value, onChange, field, placeholder, multi } = this.props;
    let options = [];
    if (field && field.values) {
      options = field.values.map(value => ({ value: value[0], label: value[1] || value[0] }))
    }

    return (
      <div>
        <TokenField
          value={value.filter(v => v != null)}
          onChange={onChange}
          placeholder={placeholder}
          multi={multi}

          options={options}

          valueRenderer={value => <RemappedValue value={value} column={field} round={false} />}
          optionRenderer={option => <RemappedValue value={option.value} column={field} round={false} />}
          layoutRenderer={({ valuesList, optionsList, focused, onClose }) =>
            <div>
              {valuesList}
              {optionsList}
            </div>
          }

          onInputChange={this.onInputChange}
          onAddFreeform={v => {
            // if the field is numeric we need to parse the string into an integer
            if (field.isNumeric()) {
              v = parseFloat(v);
              if (isNaN(v)) {
                return null;
              }
            }
            return v;
          }}
        />
      </div>
    )
  }
}
