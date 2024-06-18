import cx from "classnames";
import PropTypes from "prop-types";
import { Component } from "react";

import Select, { Option } from "metabase/core/components/Select";
import AdminS from "metabase/css/admin.module.css";
import FormS from "metabase/css/components/form.module.css";
import CS from "metabase/css/core/index.css";

import { SelectPrefixInput } from "./InputWithSelectPrefix.styled";

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

const propTypes = {
  value: PropTypes.string,
  prefixes: PropTypes.arrayOf(PropTypes.string),
  defaultPrefix: PropTypes.string,
  caseInsensitivePrefix: PropTypes.bool,
  onChange: PropTypes.func,
  placeholder: PropTypes.string,
};

export default class InputWithSelectPrefix extends Component {
  constructor(props) {
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

  componentDidUpdate(prevProps, prevState) {
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
      <div
        className={cx(
          CS.flex,
          CS.alignStretch,
          AdminS.SettingsInput,
          FormS.FormInput,
          CS.p0,
        )}
      >
        <Select
          className={CS.borderRight}
          value={prefix || defaultPrefix}
          onChange={e => this.setState({ prefix: e.target.value })}
          buttonProps={{ className: CS.borderless }}
        >
          {prefixes.map(p => (
            <Option key={p} value={p}>
              {p}
            </Option>
          ))}
        </Select>
        <SelectPrefixInput
          type="text"
          className={CS.flexFull}
          value={rest}
          placeholder={this.props.placeholder}
          onBlurChange={e => this.setState({ rest: e.target.value })}
          size="large"
        />
      </div>
    );
  }
}

InputWithSelectPrefix.propTypes = propTypes;
