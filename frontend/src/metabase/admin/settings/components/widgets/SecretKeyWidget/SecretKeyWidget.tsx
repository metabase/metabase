import { t } from "ttag";

import Confirm from "metabase/components/Confirm";
import CS from "metabase/css/core/index.css";
import { UtilApi } from "metabase/services";

import { SettingInput } from "../SettingInput";

import { GenerateButton, SecretKeyWidgetRoot } from "./SecretKeyWidget.styled";

interface SecretKeyWidgetProps {
  onChange: (token: string) => void;
  setting: any;
  confirmation: {
    header: string;
    dialog: string;
  };
}

const SecretKeyWidget = ({
  onChange,
  setting,
  confirmation,
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
          triggerClasses={CS.fullHeight}
          title={confirmation.header}
          content={confirmation.dialog}
          action={generateToken}
        >
          <GenerateButton primary>{t`Regenerate key`}</GenerateButton>
        </Confirm>
      ) : (
        <GenerateButton
          primary
          onClick={generateToken}
        >{t`Generate key`}</GenerateButton>
      )}
    </SecretKeyWidgetRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SecretKeyWidget;
