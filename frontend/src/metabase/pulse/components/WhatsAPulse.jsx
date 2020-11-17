/* eslint "react/prop-types": "warn" */
import React, { Component } from "react";
import PropTypes from "prop-types";
import { t } from "ttag";

import RetinaImage from "react-retina-image";

export default class WhatsAPulse extends Component {
  static propTypes = {
    button: PropTypes.object,
  };
  render() {
    return (
      <div className="flex flex-column align-center px4">
        <h2 className="my4 text-brand">
          {t`Help everyone on your team stay in sync with your data.`}
        </h2>
        <div className="mx4">
          <RetinaImage
            className="brand-hue"
            width={574}
            src="app/assets/img/pulse_empty_illustration.png"
            forceOriginalDimensions={false}
            style={{ maxWidth: "574px", width: "100%" }}
          />
        </div>
        <div
          className="h3 my3 text-centered text-light text-bold"
          style={{ maxWidth: "500px" }}
        >
          {t`Pulses let you send data from Metabase to email or Slack on the schedule of your choice.`}
        </div>
        {this.props.button}
      </div>
    );
  }
}
