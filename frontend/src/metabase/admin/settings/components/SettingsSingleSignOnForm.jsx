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
    this.updateDomains = this.updateDomains.bind(this);
    (this.onCheckboxClicked = this.onCheckboxClicked.bind(this)),
      (this.saveChanges = this.saveChanges.bind(this)),
      (this.clientIDChanged = this.clientIDChanged.bind(this)),
      (this.domainsChanged = this.domainsChanged.bind(this));
  }

  static propTypes = {
    elements: PropTypes.array,
    updateSetting: PropTypes.func.isRequired,
  };

  componentWillMount() {
    let { elements } = this.props,
      clientID = _.findWhere(elements, { key: "google-auth-client-id" }),
      domains = _.findWhere(elements, {
        key: "google-auth-auto-create-accounts-domain",
      });

    this.setState({
      clientID: clientID,
      domains: domains,
      clientIDValue: clientID.value,
      domainsValue: domains.value,
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

  updateDomains(newValue) {
    if (newValue === this.state.domains.value) {
      return;
    }

    this.setState({
      domainsValue: newValue && newValue.length ? newValue : null,
      recentlySaved: false,
    });
  }

  clientIDChanged() {
    return this.state.clientID.value !== this.state.clientIDValue;
  }

  domainsChanged() {
    return this.state.domains.value !== this.state.domainsValue;
  }

  saveChanges() {
    let { clientID, clientIDValue, domains, domainsValue } = this.state;

    if (this.clientIDChanged()) {
      this.props.updateSetting(clientID, clientIDValue);
      this.setState({
        clientID: {
          value: clientIDValue,
        },
        recentlySaved: true,
      });
    }

    if (this.domainsChanged()) {
      this.props.updateSetting(domains, domainsValue);
      this.setState({
        domains: {
          value: domainsValue,
        },
        recentlySaved: true,
      });
    }
  }

  onCheckboxClicked() {
    // if domains are present, clear it out; otherwise if there's no domains try to set it back to what it was
    this.setState({
      domainsValue: this.state.domainsValue ? null : this.state.domains.value,
      recentlySaved: false,
    });
  }

  render() {
    let hasChanges = this.domainsChanged() || this.clientIDChanged(),
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
          <p className="text-grey-4">
            {t`Allows users with existing Metabase accounts to login with a Google account that matches their email address in addition to their Metabase username and password.`}
          </p>
          <p className="text-grey-4">
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
              <p className="text-grey-4">{t`Allow users to sign up on their own if their Google account email address is from one of these domains (separate multiple domains with a comma):`}</p>
            </div>
            <div className="mt1 bordered rounded inline-block">
              <div className="inline-block px2 h2">@</div>
              <InputBlurChange
                className="SettingsInput inline-block AdminInput h3 border-left"
                type="text"
                value={this.state.domainsValue}
                onChange={event => this.updateDomains(event.target.value)}
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
