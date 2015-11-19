import React, { Component, PropTypes } from "react";

import ModalContent from "metabase/components/ModalContent.jsx";
import Icon from "metabase/components/Icon.jsx";

import Settings from "metabase/lib/settings";

export default class SetupModal extends Component {
    render() {
        let { isAdmin } = this.props;
        let heading, content;
        if (isAdmin) {
            heading = (
                <span className="flex align-center">
                    <span className="ml1 h5 text-uppercase text-bold">Great News</span>
                </span>
            );
            content = (
                <div className="m4 h4 text-bold">
                    <div className="h4 text-bold text-green">
                        You're an admin, so you can set up integrations
                    </div>
                    <div className="mt2">
                        <a className="Button Button--primary" href="/admin/settings">Configure</a>
                    </div>
                </div>
            );

        } else {
            let adminEmail = Settings.get("admin_email");
            heading = (
                <span className="flex align-center relative" style={{top: "-10px"}}>
                    <Icon name="mail" width={20} />
                    <span className="ml1 h5 text-uppercase text-bold">Admin Email</span>
                </span>
            );
            content = (
                <div className="m4 h4 text-bold">
                    <a className="no-decoration" href={"mailto:"+adminEmail}>{adminEmail}</a>
                </div>
            );
        }
        return (
            <ModalContent
                closeFn={this.props.onClose}
            >
                <div className="mx4 px4 pb4 text-centered">
                    <h2>To send pulses, an admin needs to set up email or Slack integration.</h2>
                    <div className="mt4 rounded bordered relative">
                        <div className="absolute left right flex align-center layout-centered" style={{ top: "-8px" }}>
                            <span className="bg-white text-grey-3 px2">
                                {heading}
                            </span>
                        </div>
                        {content}
                    </div>
                </div>
            </ModalContent>
        );
    }
}
