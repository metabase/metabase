/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import RetinaImage from "react-retina-image";

export default class WhatsAPulse extends Component {
    static propTypes = {
        button: PropTypes.object
    };
    render() {
        return (
            <div className="flex flex-column align-center px4">
                <div className="h2 mb4 text-centered text-brand text-bold">
                    Help everyone on your team stay in sync with your data.
                </div>
                <div className="mx4">
                    <RetinaImage
                        width={574}
                        src="/app/img/pulse_empty_illustration.png"
                        forceOriginalDimensions={false}
                    />
                </div>
                <div className="h3 my3 text-centered  text-grey-2 text-bold" style={{maxWidth: "500px"}}>
                    Pulses let you send data from Metabase to email or Slack on the schedule of your choice.
                </div>
                {this.props.button}
            </div>
        );
    }
}
