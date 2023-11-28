import type { ChangeEvent } from "react";
import { Component } from "react";
import type { SelectChangeEvent } from "metabase/core/components/Select";
import Select, { Option } from "metabase/core/components/Select";
import { SelectPrefixInput } from "./InputWithSelectPrefix.styled";

function splitValue({
  value,
  prefixes,
  defaultPrefix,
  caseInsensitivePrefix = false,
}: {
  value?: string;
  prefixes: string[];
  defaultPrefix: string;
  caseInsensitivePrefix?: boolean;
}): string[] {
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

type InputWithSelectPrefixProps = {
  value?: string;
  prefixes: string[];
  defaultPrefix: string;
  caseInsensitivePrefix?: boolean;
  onChange: (e: { target: { value: string } }) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
};

// eslint-disable-next-line import/no-default-export
export default class InputWithSelectPrefix extends Component<
  InputWithSelectPrefixProps,
  { prefix: string; rest: string }
> {
  constructor(props: InputWithSelectPrefixProps) {
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

  componentDidUpdate(prevProps: InputWithSelectPrefixProps) {
    if (prevProps.value !== this.props.value) {
      this.setPrefixAndRestFromValue();
    }
  }

  handleManualPrefixWriting(e: ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    for (const prefix of this.props.prefixes) {
      if (value.startsWith(prefix)) {
        const newValue = { prefix, rest: value.slice(prefix.length) };
        this.setState(newValue);
        if (newValue.rest !== "") {
          this.handleChange(newValue.prefix, newValue.rest);
        }
        return;
      }
    }
  }

  handleChange(prefix: string, rest: string) {
    this.props.onChange({
      target: { value: prefix + rest },
    });
  }

  render() {
    const { prefixes, defaultPrefix, autoFocus, id } = this.props;
    const { prefix, rest } = this.state;
    return (
      <div className="flex align-stretch SettingsInput Form-input p0" id={id}>
        <Select
          className="border-right"
          value={prefix || defaultPrefix}
          onChange={(e: SelectChangeEvent<string>) => {
            this.setState({ prefix: e.target.value });
            if (this.state.rest !== "") {
              this.handleChange(e.target.value, this.state.rest);
            }
          }}
          buttonProps={{ className: "borderless" }}
        >
          {prefixes.map(p => (
            <Option key={p} value={p}>
              {p}
            </Option>
          ))}
        </Select>
        <SelectPrefixInput
          type="text"
          autoFocus={autoFocus}
          className="flex-full"
          value={rest}
          onChange={this.handleManualPrefixWriting.bind(this)}
          placeholder={this.props.placeholder}
          onBlurChange={e => {
            this.setState({ rest: e.target.value });
            this.handleChange(prefix, e.target.value);
          }}
          size="large"
        />
      </div>
    );
  }
}
