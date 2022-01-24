/* eslint-disable react/prop-types */
import React, { Component } from "react";

import InputWithSelectPrefix from "metabase/components/InputWithSelectPrefix";

export default class SiteUrlWidget extends Component {
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
