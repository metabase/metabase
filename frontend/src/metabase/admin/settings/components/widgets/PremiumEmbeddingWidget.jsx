import React, { Component } from "react";

import MetabaseSettings from "metabase/lib/settings";

import SettingInput from "./SettingInput.jsx";

export default class PremiumEmbeddingWidget extends Component {
    render() {
        const { setting } = this.props;

        return (
            <div>
                <SettingInput {...this.props} />
                <h3 className="mt4 mb4">
                    Getting your very own premium embedding token
                </h3>
                <a href={MetabaseSettings.metastoreUrl()} target="_blank">
                    Visit the MetaStore
                </a>
            </div>
        );
    }
}
