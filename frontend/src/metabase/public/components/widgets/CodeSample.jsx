/* eslint-disable react/prop-types */
import { Component } from "react";

import _ from "underscore";
import Select, { Option } from "metabase/core/components/Select";
import CopyButton from "metabase/components/CopyButton";

import AceEditor from "metabase/components/TextEditor";

export default class CodeSample extends Component {
  constructor(props) {
    super(props);
    this.state = {
      name:
        Array.isArray(props.options) && props.options.length > 0
          ? props.options[0].name
          : null,
    };
  }

  setOption(name) {
    this.setState({ name });
  }

  handleChange(name) {
    const { options, onChangeOption } = this.props;
    this.setState({ name });
    if (onChangeOption) {
      onChangeOption(_.findWhere(options, { name }));
    }
  }

  render() {
    const { className, title, options, dataTestId } = this.props;
    const { name } = this.state;
    const selected = _.findWhere(options, { name });
    const source = selected && selected.source();
    return (
      <div className={className}>
        {(title || (options && options.length > 1)) && (
          <div className="flex align-center">
            <h4>{title}</h4>
            {options && options.length > 1 ? (
              <Select
                className="AdminSelect--borderless ml-auto pt1 pb1"
                value={name}
                onChange={e => this.handleChange(e.target.value)}
                buttonProps={{
                  dataTestId,
                }}
              >
                {options.map(option => (
                  <Option key={option.name} value={option.name}>
                    {option.name}
                  </Option>
                ))}
              </Select>
            ) : null}
          </div>
        )}
        <div className="bordered rounded shadowed relative">
          <AceEditor
            className="z1"
            value={source}
            mode={selected && selected.mode}
            theme="ace/theme/metabase"
            sizeToFit
            readOnly
          />
          {source && (
            <div className="absolute top right text-brand-hover cursor-pointer z2">
              <CopyButton className="p1" value={source} />
            </div>
          )}
        </div>
      </div>
    );
  }
}
