import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import _ from "underscore";
import { t, jt } from "c-3po";

import Breadcrumbs from "metabase/components/Breadcrumbs.jsx";
import InputBlurChange from "metabase/components/InputBlurChange.jsx";

export default class SettingsSingleSignOnForm extends Component {
  constructor(props, context) {
    super(props, context);
    this.updateClientID = this.updateClientID.bind(this);
    this.updateDomain = this.updateDomain.bind(this);
    (this.onCheckboxClicked = this.onCheckboxClicked.bind(this)),
      (this.saveChanges = this.saveChanges.bind(this)),
      (this.clientIDChanged = this.clientIDChanged.bind(this)),
      (this.domainChanged = this.domainChanged.bind(this));
  }

  static propTypes = {
    elements: PropTypes.array,
    updateSetting: PropTypes.func.isRequired,
  };

  componentWillMount() {
    let { elements } = this.props,
      clientID = _.findWhere(elements, { key: "google-auth-client-id" }),
      domain = _.findWhere(elements, {
        key: "google-auth-auto-create-accounts-domain",
      });

    this.setState({
      clientID: clientID,
      domain: domain,
      clientIDValue: clientID.value,
      domainValue: domain.value,
      recentlySaved: false,
    });
  }

  updateClientID(newValue) {
    if (newValue === this.state.clientIDValue) {
      return;
    }

    this.setState({
      clientIDValue: newValue && newValue.length ? newValue : null,
      recentlySaved: false,
    });
  }

  updateDomain(newValue) {
    if (newValue === this.state.domain.value) {
      return;
    }

    this.setState({
      domainValue: newValue && newValue.length ? newValue : null,
      recentlySaved: false,
    });
  }

  clientIDChanged() {
    return this.state.clientID.value !== this.state.clientIDValue;
  }

  domainChanged() {
    return this.state.domain.value !== this.state.domainValue;
  }

  saveChanges() {
    let { clientID, clientIDValue, domain, domainValue } = this.state;

    if (this.clientIDChanged()) {
      this.props.updateSetting(clientID, clientIDValue);
      this.setState({
        clientID: {
          value: clientIDValue,
        },
        recentlySaved: true,
      });
    }

    if (this.domainChanged()) {
      this.props.updateSetting(domain, domainValue);
      this.setState({
        domain: {
          value: domainValue,
        },
        recentlySaved: true,
      });
    }
  }

  onCheckboxClicked() {
    // if domain is present, clear it out; otherwise if there's no domain try to set it back to what it was
    this.setState({
      domainValue: this.state.domainValue ? null : this.state.domain.value,
      recentlySaved: false,
    });
  }

  render() {
    let hasChanges = this.domainChanged() || this.clientIDChanged(),
      hasClientID = this.state.clientIDValue;

    return (
      <form noValidate>
        <div className="px2" style={{ maxWidth: "585px" }}>
          <Breadcrumbs
            crumbs={[
              [t`Authentication`, "/admin/settings/authentication"],
              [t`Google Sign-In`],
            ]}
            className="mb2"
          />
          <h2>{t`Sign in with Google`}</h2>
          <p className="text-medium">
            {t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`}
          </p>
          <p className="text-medium">
            {jt`To allow users to sign in with Google you'll need to give Metabase a Google Developers console application client ID. It only takes a few steps and instructions on how to create a key can be found ${(
              <a
                className="link"
                href="https://developers.google.com/identity/sign-in/web/devconsole-project"
                target="_blank"
              >
                here.
              </a>
            )}`}
          </p>
          <InputBlurChange
            className="SettingsInput AdminInput bordered rounded h3"
            type="text"
            value={this.state.clientIDValue}
            placeholder={t`Your Google client ID`}
            onChange={event => this.updateClientID(event.target.value)}
          />
          <div className="py3">
            <div className="flex align-center">
              <p className="text-medium">{t`Allow users to sign up on their own if their Google account email address is from:`}</p>
            </div>
            <div className="mt1 bordered rounded inline-block">
              <div className="inline-block px2 h2">@</div>
              <InputBlurChange
                className="SettingsInput inline-block AdminInput h3 border-left"
                type="text"
                value={this.state.domainValue}
                onChange={event => this.updateDomain(event.target.value)}
                disabled={!hasClientID}
              />
            </div>
          </div>

          <button
            className={cx("Button mr2", { "Button--primary": hasChanges })}
            disabled={!hasChanges}
            onClick={this.saveChanges}
          >
            {this.state.recentlySaved ? t`Changes saved!` : t`Save Changes`}
          </button>
        </div>
      </form>
    );
  }
}
