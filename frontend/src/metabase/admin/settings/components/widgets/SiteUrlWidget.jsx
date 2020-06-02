/* @flow */

import React, { Component } from "react";

import InputWithSelectPrefix from "metabase/components/InputWithSelectPrefix";

type Props = {
  onChange: (value: any) => void,
  setting: { value: string },
};

export default class SiteUrlWidget extends Component {
  props: Props;

  render() {
    const { setting, onChange } = this.props;
    return (
      <InputWithSelectPrefix
        value={setting.value}
        onChange={e => onChange(e.target.value)}
        prefixes={["https://", "http://"]}
        defaultPrefix="http://"
        caseInsensitivePrefix={true}
      />
    );
  }
}
