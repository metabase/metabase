/* eslint-disable react/prop-types */
import React, { Component } from "react";
import { t } from "ttag";

import Button from "metabase/components/Button";
import Confirm from "metabase/components/Confirm";
import { UtilApi } from "metabase/services";

import SettingInput from "./SettingInput";

type Props = {
  onChange: (value: any) => void,
  setting: {},
};

export default class SecretKeyWidget extends Component {
  props: Props;

  _generateToken = async () => {
    const { onChange } = this.props;
    const result = await UtilApi.random_token();
    onChange(result.token);
  };

  render() {
    const { setting } = this.props;
    return (
      <div
        className="p2 flex align-center full bordered rounded"
        style={{ maxWidth: 820 }}
      >
        <SettingInput {...this.props} />
        {setting.value ? (
          <Confirm
            title={t`Regenerate embedding key?`}
            content={t`This will cause existing embeds to stop working until they are updated with the new key.`}
            action={this._generateToken}
          >
            <Button className="ml1" primary medium>{t`Regenerate key`}</Button>
          </Confirm>
        ) : (
          <Button
            className="ml1"
            primary
            medium
            onClick={this._generateToken}
          >{t`Generate Key`}</Button>
        )}
      </div>
    );
  }
}
