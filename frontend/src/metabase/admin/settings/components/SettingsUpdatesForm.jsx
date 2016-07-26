import React, { Component, PropTypes } from "react";

import MetabaseSettings from "metabase/lib/settings";
import SettingsSetting from "./SettingsSetting.jsx";

import _ from "underscore";


export default class SettingsUpdatesForm extends Component {

    static propTypes = {
        elements: PropTypes.array
    };

    removeVersionPrefixIfNeeded(versionLabel) {
        return versionLabel.startsWith("v") ? versionLabel.substring(1) : versionLabel;
    }

    renderVersion(version) {
        return (
            <div className="pb3">
                <h3 className="text-grey-4">{this.removeVersionPrefixIfNeeded(version.version)} {version.patch ? "(patch release)" : null}</h3>
                <ul style={{listStyleType: "disc", listStylePosition: "inside"}}>
                    {version.highlights && version.highlights.map(highlight =>
                        <li style={{lineHeight: "1.5"}} className="pl1">{highlight}</li>
                    )}
                </ul>
            </div>
        );
    }

    renderVersionUpdateNotice() {
        let versionInfo = _.findWhere(this.props.settings, {key: "version-info"}),
            currentVersion = MetabaseSettings.get("version").tag;

        if (versionInfo) versionInfo = versionInfo.value;

        /*
            We expect the versionInfo to take on the JSON structure detailed below.
            The 'older' section should contain only the last 5 previous versions, we don't need to go on forever.
            The highlights for a version should just be text and should be limited to 5 items tops.

            {
                "latest": {
                    "version": "v0.17.1",
                    "released": "2016-05-04T21:09:36.358Z",
                    "patch": true,
                    "highlights":[
                        "some stuff happened",
                        "another great thing"
                    ]
                },
                "older": [
                    {
                        "version": "v0.17.0",
                        "released": "2016-05-04T21:09:36.358Z",
                        "patch": false,
                        "highlights": []
                    },
                    {
                        "version": "v0.16.1",
                        "released": "2016-05-04T21:09:36.358Z",
                        "patch": true,
                        "highlights": []
                    }
                ]
            }

        */

        if (!versionInfo || currentVersion === versionInfo.latest.version) {
            return (
                <div className="p2 bg-brand bordered rounded border-brand text-white text-bold">
                    You're running Metabase {this.removeVersionPrefixIfNeeded(currentVersion)} which is the latest and greatest!
                </div>
            );
        } else {
            return (
                <div>
                    <div className="p2 bg-green bordered rounded border-green flex flex-row align-center justify-between">
                        <span className="text-white text-bold">Metabase {this.removeVersionPrefixIfNeeded(versionInfo.latest.version)} is available.  You're running {this.removeVersionPrefixIfNeeded(currentVersion)}</span>
                        <a data-metabase-event={"Updates Settings; Update link clicked; "+versionInfo.latest.version} className="Button Button--white Button--medium borderless" href="http://www.metabase.com/start" target="_blank">Update</a>
                    </div>

                    <div className="text-grey-3">
                        <h3 className="py3 text-uppercase">What's Changed:</h3>

                        {this.renderVersion(versionInfo.latest)}

                        {versionInfo.older && versionInfo.older.map(this.renderVersion.bind(this))}
                    </div>
                </div>
            );
        }
    }

    render() {
        let { elements } = this.props;

        let settings = elements.map((setting, index) => {
            return <SettingsSetting key={setting.key} setting={setting} updateSetting={this.props.updateSetting} handleChangeEvent={this.props.handleChangeEvent} autoFocus={index === 0}/>
        });

        return (
            <div style={{width: "585px"}}>
                <ul>
                    {settings}
                </ul>

                <div className="px2">
                    <div className="pt3 border-top">
                        {this.renderVersionUpdateNotice()}
                    </div>
                </div>
            </div>
        );
    }
}
