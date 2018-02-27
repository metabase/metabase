import React from "react";
import TokenField from "metabase/components/TokenField";

export const component = TokenField;

export const description = `
Token field picker with searching
`;

class TokenFieldWithStateAndDefaults extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      value: props.value || [],
    };
  }
  render() {
    return (
      <TokenField
        value={this.state.value}
        options={[]}
        onChange={value => this.setState({ value })}
        multi
        valueKey={option => option}
        labelKey={option => option}
        layoutRenderer={({ valuesList, optionsList }) => (
          <div>
            {valuesList}
            {optionsList}
          </div>
        )}
        {...this.props}
      />
    );
  }
}

export const examples = {
  "": (
    <TokenFieldWithStateAndDefaults
      options={["Doohickey", "Gadget", "Gizmo", "Widget"]}
    />
  ),
  updateOnInputChange: (
    <TokenFieldWithStateAndDefaults
      options={["Doohickey", "Gadget", "Gizmo", "Widget"]}
      updateOnInputChange
      parseFreeformValue={value => value}
    />
  ),
};
