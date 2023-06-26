/* eslint-disable react/prop-types */
import { Component } from "react";
import { t } from "ttag";

import SettingToggle from "./SettingToggle";

const VERIFIED = "verified";
const CHECKING = "checking";
const NOT_CHECKED = "not_checked";
const FAILED = "failed";

export default class HttpsOnlyWidget extends Component {
  constructor(props) {
    super(props);
    this.state = {
      status: NOT_CHECKED,
    };
  }

  checkHttps() {
    const req = new XMLHttpRequest();
    req.timeout = 10000; // don't make the user wait >10s
    req.addEventListener("load", () => this.setState({ status: VERIFIED }));
    req.addEventListener("error", () => this.setState({ status: FAILED }));
    req.open("GET", this.props.settingValues["site-url"] + "/api/health");
    this.setState({ status: CHECKING });
    req.send();
  }

  componentDidMount() {
    this.checkHttps();
  }

  componentDidUpdate(prevProps) {
    if (
      prevProps.settingValues["site-url"] !==
      this.props.settingValues["site-url"]
    ) {
      this.checkHttps();
    }
  }

  render() {
    const { status } = this.state;
    return (
      <div>
        {
          status === VERIFIED ? (
            <SettingToggle {...this.props} />
          ) : status === CHECKING ? (
            t`Checking HTTPS...`
          ) : status === FAILED ? (
            t`It looks like HTTPS is not properly configured`
          ) : null // NOT_CHECKED
        }
      </div>
    );
  }
}
