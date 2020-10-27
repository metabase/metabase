/* @flow */

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

export default class InputWithSelectPrefix extends Component {
  props: Props;
  state: State;

  constructor(props: Props) {
    super(props);
    this.state = { prefix: "", rest: "" };
  }

  componentDidMount() {
    this.setPrefixAndRestFromValue();
  }

  setPrefixAndRestFromValue() {
    const {
      value,
      prefixes,
      defaultPrefix,
      caseInsensitivePrefix = false,
    } = this.props;
    if (value) {
      const prefix = prefixes.find(
        caseInsensitivePrefix
          ? p => value.toLowerCase().startsWith(p.toLowerCase())
          : p => value.startsWith(p),
      );
      this.setState(
        prefix
          ? { prefix, rest: value.slice(prefix.length) }
          : { prefix: defaultPrefix, rest: value },
      );
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
            <Option value={p}>{p}</Option>
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
