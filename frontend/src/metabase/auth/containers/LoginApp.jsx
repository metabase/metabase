import React, { Component } from "react";
import { Link } from "react-router";
import { connect } from "react-redux";

import { t } from "ttag";
import _ from "underscore";
import AuthScene from "../components/AuthScene";
import LogoIcon from "metabase/components/LogoIcon";

import { getAuthProviders } from "../selectors";

const mapStateToProps = (state, props) => ({
  providers: getAuthProviders(state, props),
});

@connect(mapStateToProps)
export default class LoginApp extends Component {
  renderPanel(provider) {
    return <provider.Panel {...this.props} />;
  }
  renderButton(provider) {
    return (
      <Link
        key={provider.name}
        to={provider.Panel ? `/auth/login/${provider.name}` : null}
        className="mt2 block"
      >
        <provider.Button {...this.props} />
      </Link>
    );
  }
  render() {
    const { providers, params } = this.props;
    const selected = _.findWhere(providers, { name: params.provider });
    const visibleProviders = selected ? [selected] : providers;

    return (
      <div className="flex flex-column flex-full md-layout-centered">
        <div className="Login-wrapper wrapper Grid Grid--full md-Grid--1of2 relative z2">
          <div className="Grid-cell flex layout-centered text-brand">
            <LogoIcon className="Logo my4 sm-my0" height={65} />
          </div>
          <div className="Login-content Grid-cell p4 bg-white bordered rounded shadowed">
            <h2 className="Login-header mb2">{t`Sign in to Metabase`}</h2>
            {visibleProviders.length === 1 && visibleProviders[0].Panel ? (
              this.renderPanel(visibleProviders[0])
            ) : (
              <div className="pt2 relative">
                {visibleProviders.map(provider => this.renderButton(provider))}
              </div>
            )}
          </div>
        </div>
        <AuthScene />
      </div>
    );
  }
}
