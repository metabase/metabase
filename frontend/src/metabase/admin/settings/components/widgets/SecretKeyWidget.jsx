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

export default class SecretKeyWidget extends Component {
    props: Props;

    _generateToken = async () => {
        const { updateSetting } = this.props;
        const result = await UtilApi.random_token();
        updateSetting(result.token);
    }

    render() {
        const { setting } = this.props;
        return (
            <div className="p2 flex align-center full bordered rounded" style={{ maxWidth: 820 }}>
                <div className="full">
                    <SettingInput {...this.props} />
                </div>
                { setting.value ?
                    <Confirm
                        title="Regenerate embedding key?"
                        content="This will cause existing embeds to stop working until they are updated with the new key."
                        action={this._generateToken}
                    >
                        <Button className="ml-auto" primary medium>Regenerate key</Button>
                    </Confirm>
                :
                    <Button className="ml-auto" primary medium onClick={this._generateToken}>Generate Key</Button>
                }
            </div>
        );
    }
}
