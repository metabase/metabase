/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";

import RetinaImage from "react-retina-image";

export default class WhatsADashboard extends Component {
    static propTypes = {
        button: PropTypes.object
    };
    render() {
        return (
            <div className="flex flex-column align-center px4">
                <h2 className="my4 text-brand">
                    Copy & image missing
                </h2>
                <div className="mx4">
                    <RetinaImage
                        width={574}
                        src="/app/img/pulse_empty_illustration.png"
                        forceOriginalDimensions={false}
                    />
                </div>
                <div className="h3 my3 text-centered text-grey-2 text-bold" style={{maxWidth: "500px"}}>
                    Copy & image missing
                </div>
                {this.props.button}
            </div>
        );
    }
}
