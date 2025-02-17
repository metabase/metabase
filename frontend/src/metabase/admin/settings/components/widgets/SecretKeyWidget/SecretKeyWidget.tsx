import { useState } from "react";
import { t } from "ttag";

import { ConfirmationModal } from "metabase/components/ConfirmationModal";
import { UtilApi } from "metabase/services";
import { Button } from "metabase/ui";

import { SettingInput } from "../SettingInput";

import { SecretKeyWidgetRoot } from "./SecretKeyWidget.styled";

interface SecretKeyWidgetProps {
  id?: string;
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

  const [regenerateTokenModalIsOpen, setRegenerateTokenModalIsOpen] =
    useState(false);

  return (
    <SecretKeyWidgetRoot>
      <SettingInput setting={setting} onChange={onChange} {...(rest as any)} />
      {setting.value ? (
        <>
          <Button
            variant="filled"
            onClick={() => setRegenerateTokenModalIsOpen(true)}
            ml="1rem"
            h="100%"
          >{t`Regenerate key`}</Button>
          <ConfirmationModal
            opened={regenerateTokenModalIsOpen}
            title={t`Regenerate embedding key?`}
            content={t`This will cause existing embeds to stop working until they are updated with the new key.`}
            onConfirm={() => {
              generateToken();
              setRegenerateTokenModalIsOpen(false);
            }}
            onClose={() => setRegenerateTokenModalIsOpen(false)}
          />
        </>
      ) : (
        <Button
          variant="filled"
          onClick={generateToken}
          ml="1rem"
          h="100%"
        >{t`Generate key`}</Button>
      )}
    </SecretKeyWidgetRoot>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default SecretKeyWidget;
