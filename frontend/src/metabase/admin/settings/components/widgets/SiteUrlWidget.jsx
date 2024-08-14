import PropTypes from "prop-types";
import { Component } from "react";

import InputWithSelectPrefix from "metabase/components/InputWithSelectPrefix";

const propTypes = {
  setting: PropTypes.object.isRequired,
  onChange: PropTypes.func.isRequired,
};

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
        placeholder={setting.placeholder}
      />
    );
  }
}

SiteUrlWidget.propTypes = propTypes;
