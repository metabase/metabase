/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router";
import { t } from "c-3po";

import Settings from "metabase/lib/settings";

export default class ChannelSetupMessage extends Component {
  static propTypes = {
    user: PropTypes.object.isRequired,
    channels: PropTypes.array.isRequired,
  };

  static defaultProps = {
    channels: ["email", "Slack"],
  };

  render() {
    let { user, channels } = this.props;
    let content;
    if (user.is_superuser) {
      content = (
        <div>
          {channels.map(c => (
            <Link
              to={"/admin/settings/" + c.toLowerCase()}
              key={c.toLowerCase()}
              className="Button Button--primary mr1"
              target={window.OSX ? null : "_blank"}
            >
              {t`Configure`} {c}
            </Link>
          ))}
        </div>
      );
    } else {
      let adminEmail = Settings.get("admin_email");
      content = (
        <div className="mb1">
          <h4 className="text-medium">{t`Your admin's email address`}:</h4>
          <a className="h2 link no-decoration" href={"mailto:" + adminEmail}>
            {adminEmail}
          </a>
        </div>
      );
    }
    return content;
  }
}
