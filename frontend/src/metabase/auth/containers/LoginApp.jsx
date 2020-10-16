import React, { Component } from "react";
import { Link } from "react-router";
import { connect } from "react-redux";
import { t } from "ttag";
import _ from "underscore";

import AuthLayout from "metabase/auth/components/AuthLayout";

import { getAuthProviders } from "../selectors";

const mapStateToProps = (state, props) => ({
  providers: getAuthProviders(state, props),
});

@connect(mapStateToProps)
export default class LoginApp extends Component {
  renderPanel(provider) {
    return <provider.Panel {...this.props} />;
  }
  render() {
    const { providers, params } = this.props;
    const selected = _.findWhere(providers, { name: params.provider });
    const visibleProviders = selected ? [selected] : providers;

    return (
      <AuthLayout>
        <h2 className="text-centered mb3">{t`Sign in to Metabase`}</h2>
        {visibleProviders.length === 1 && visibleProviders[0].Panel ? (
          this.renderPanel(visibleProviders[0])
        ) : (
          <div className="pt2 relative">
            {visibleProviders.map(provider => (
              <Link
                key={provider.name}
                to={provider.Panel ? `/auth/login/${provider.name}` : null}
                className="mt2 block"
              >
                <provider.Button {...this.props} />
              </Link>
            ))}
          </div>
        )}
      </AuthLayout>
    );
  }
}
