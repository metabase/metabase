import React from "react";

import SettingInput from "../SettingInput";
import Button from "metabase/core/components/Button";
import Confirm from "metabase/components/Confirm";
import { t } from "ttag";
import { UtilApi } from "metabase/services";
import { GenerateButton, SecretKeyWidgetRoot } from "./SecretKeyWidget.styled";

interface SecretKeyWidgetProps {
  onChange: (token: string) => void;
  setting: any;
}

const SecretKeyWidget = ({
  onChange,
  setting,
  ...rest
}: SecretKeyWidgetProps) => {
  const generateToken = async () => {
    const result = await UtilApi.random_token();
    onChange(result.token);
  };

  return (
    <SecretKeyWidgetRoot>
      <SettingInput setting={setting} onChange={onChange} {...(rest as any)} />
      {setting.value ? (
        <Confirm
          triggerClasses="full-height"
          title={t`Regenerate embedding key?`}
          content={t`This will cause existing embeds to stop working until they are updated with the new key.`}
          action={generateToken}
        >
          <GenerateButton primary>{t`Regenerate key`}</GenerateButton>
        </Confirm>
      ) : (
        <GenerateButton
          primary
          onClick={generateToken}
        >{t`Generate Key`}</GenerateButton>
      )}
    </SecretKeyWidgetRoot>
  );
};

export default SecretKeyWidget;
