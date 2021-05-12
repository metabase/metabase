import React, { Component } from "react";

import Select, { Option } from "./Select";
import InputBlurChange from "./InputBlurChange";

type Props = {
  onChange: (value: any) => void,
  value: string,
  prefixes: string[],
  defaultPrefix: string,
  caseInsensitivePrefix?: boolean,
};

type State = {
  prefix: string,
  rest: string,
};

function splitValue({
  value,
  prefixes,
  defaultPrefix,
  caseInsensitivePrefix = false,
}) {
  if (value == null) {
    return ["", ""];
  }

  const prefix = prefixes.find(
    caseInsensitivePrefix
      ? p => value.toLowerCase().startsWith(p.toLowerCase())
      : p => value.startsWith(p),
  );

  return prefix ? [prefix, value.slice(prefix.length)] : [defaultPrefix, value];
}

export default class InputWithSelectPrefix extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);

    const [prefix, rest] = splitValue(props);
    this.state = { prefix, rest };
  }

  setPrefixAndRestFromValue() {
    const { value } = this.props;

    if (value) {
      const [prefix, rest] = splitValue(this.props);
      this.setState({ prefix, rest });
    }
  }

  componentDidUpdate(prevProps: Props, prevState: State) {
    const { prefix, rest } = this.state;
    if (prevState.rest !== rest || prevState.prefix !== prefix) {
      const value = prefix + rest;
      this.props.onChange({ target: { value } });
    }
    if (prevProps.value !== this.props.value) {
      this.setPrefixAndRestFromValue();
    }
  }

  render() {
    const { prefixes, defaultPrefix } = this.props;
    const { prefix, rest } = this.state;
    return (
      <div className="flex align-stretch SettingsInput Form-input p0">
        <Select
          className="border-right"
          value={prefix || defaultPrefix}
          onChange={e => this.setState({ prefix: e.target.value })}
          buttonProps={{ className: "borderless" }}
        >
          {prefixes.map(p => (
            <Option key={p} value={p}>
              {p}
            </Option>
          ))}
        </Select>
        <InputBlurChange
          type="text"
          className="Form-input flex-full borderless"
          value={rest}
          placeholder={"foo"}
          onBlurChange={e => this.setState({ rest: e.target.value })}
        />
      </div>
    );
  }
}
