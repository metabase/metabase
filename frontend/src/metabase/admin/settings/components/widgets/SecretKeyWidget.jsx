/* @flow */

import React, { Component } from "react";

import SettingInput from "./SettingInput";
import Button from "metabase/components/Button";
import Confirm from "metabase/components/Confirm";

import { UtilApi } from "metabase/services";

type Props = {
    updateSetting: (value: any) => void,
    setting: {}
};

export default class SecretKeyWidget extends Component<*, Props, *> {
    props: Props;

    _generateToken = async () => {
        const { updateSetting } = this.props;
        const result = await UtilApi.random_token();
        updateSetting(result.token);
    }

    render() {
        const { setting } = this.props;
        return (
            <div className="flex align-center">
                <SettingInput {...this.props} />
                { setting.value ?
                    <Confirm
                        title="Generate a new key?"
                        ontent="This will cause existing embeds to stop working until they are updated with the new key."
                        action={this._generateToken}
                    >
                        <Button className="ml1" primary medium>Regenerate Key</Button>
                    </Confirm>
                :
                    <Button className="ml1" primary medium onClick={this._generateToken}>Generate Key</Button>
                }
            </div>
        );
    }
}
