/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import cx from "classnames";
import { t } from "c-3po";
import SetUserPassword from "./SetUserPassword.jsx";
import UpdateUserDetails from "./UpdateUserDetails.jsx";

export default class UserSettings extends Component {
  static propTypes = {
    tab: PropTypes.string.isRequired,
    user: PropTypes.object.isRequired,
    setTab: PropTypes.func.isRequired,
    updateUser: PropTypes.func.isRequired,
    updatePassword: PropTypes.func.isRequired,
  };

  onSetTab(tab) {
    this.props.setTab(tab);
  }

  onUpdatePassword(details) {
    this.props.updatePassword(
      details.user_id,
      details.password,
      details.old_password,
    );
  }

  onUpdateDetails(user) {
    this.props.updateUser(user);
  }

  render() {
    let { tab } = this.props;
    const nonSSOManagedAccount =
      !this.props.user.google_auth && !this.props.user.ldap_auth;

    let allClasses =
        "Grid-cell md-no-flex md-mt1 text-brand-hover bordered border-brand-hover rounded p1 md-p3 block cursor-pointer text-centered md-text-left",
      tabClasses = {};

    ["details", "password"].forEach(function(t) {
      tabClasses[t] =
        t === tab
          ? allClasses + " bg-brand text-white text-white-hover"
          : allClasses;
    });

    return (
      <div>
        <div className="py4 border-bottom">
          <div className="wrapper wrapper--trim">
            <h2 className="text-medium">{t`Account settings`}</h2>
          </div>
        </div>
        <div className="mt2 md-mt4 wrapper wrapper--trim">
          <div className="Grid Grid--gutters Grid--full md-Grid--normal md-flex-reverse">
            {nonSSOManagedAccount && (
              <div className="Grid-cell Grid Grid--fit md-flex-column md-Cell--1of3">
                <a
                  className={cx(tabClasses["details"])}
                  onClick={this.onSetTab.bind(this, "details")}
                >
                  {t`User Details`}
                </a>

                <a
                  className={cx(tabClasses["password"])}
                  onClick={this.onSetTab.bind(this, "password")}
                >
                  {t`Password`}
                </a>
              </div>
            )}
            <div className="Grid-cell">
              {tab === "details" ? (
                <UpdateUserDetails
                  submitFn={this.onUpdateDetails.bind(this)}
                  {...this.props}
                />
              ) : tab === "password" ? (
                <SetUserPassword
                  submitFn={this.onUpdatePassword.bind(this)}
                  {...this.props}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    );
  }
}
