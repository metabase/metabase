/* eslint "react/prop-types": "warn" */
import React, { Component, PropTypes } from "react";
import { Link } from "react-router";

import Icon from "metabase/components/Icon.jsx";

import Settings from "metabase/lib/settings";

export default class SetupMessage extends Component {
    static propTypes = {
        user: PropTypes.object.isRequired,
        channels: PropTypes.array.isRequired
    };

    static defaultProps = {
        channels: ["Email", "Slack"]
    }

    render() {
        let { user, channels } = this.props;
        let heading, content;
        if (user.is_superuser) {
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
                        {channels.map(c =>
                            <Link to={"/admin/settings/"+c.toLowerCase()} key={c.toLowerCase()} className="Button Button--primary mr1" target={window.OSX ? null : "_blank"}>Configure {c}</Link>
                        )}
                    </div>
                </div>
            );

        } else {
            let adminEmail = Settings.get("admin_email");
            heading = (
                <span className="flex align-center relative" style={{top: "-10px"}}>
                    <Icon name="mail" size={20} />
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
            <div className="mt4 rounded bordered relative">
                <div className="absolute left right flex align-center layout-centered" style={{ top: "-8px" }}>
                    <span className="bg-white text-grey-3 px2">
                        {heading}
                    </span>
                </div>
                {content}
            </div>
        );
    }
}
