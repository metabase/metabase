import React, { Component } from "react";
import PropTypes from "prop-types";
import Icon from "metabase/components/Icon";
import { capitalize } from "humanize-plus";
import { t } from "ttag";

const propTypes = {
  provider: PropTypes.string,
  onClick: PropTypes.func,
};

class AuthProviderButton extends Component {
  render() {
    const { provider, onClick } = this.props;
    return (
      <div
        className="relative z2 bg-white p2 cursor-pointer shadow-hover text-centered sm-text-left rounded bordered shadowed flex"
        onClick={onClick}
      >
        <div className="flex align-center ml-auto mr-auto">
          {provider && <Icon className="mr1" name={provider} />}
          <h4>
            {provider ? t`Sign in with ${capitalize(provider)}` : t`Sign in`}
          </h4>
        </div>
      </div>
    );
  }
}

AuthProviderButton.proptypes = propTypes;

export default AuthProviderButton;
