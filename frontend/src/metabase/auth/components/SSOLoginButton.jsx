import React, { Component } from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";
import { capitalize } from "humanize-plus";
import { t } from "c-3po";

const propTypes = {
  provider: PropTypes.string.isRequired,
};

class SSOLoginButton extends Component {
  render() {
    const { provider } = this.props;
    return (
      <div className="relative z2 bg-white p2 cursor-pointer shadow-hover text-centered sm-text-left rounded block sm-inline-block bordered shadowed">
        <div className="flex align-center">
          <Icon className="mr1" name={provider} />
          <h4>{t`Sign in with ${capitalize(provider)}`}</h4>
        </div>
      </div>
    );
  }
}

SSOLoginButton.proptypes = propTypes;

export default SSOLoginButton;
