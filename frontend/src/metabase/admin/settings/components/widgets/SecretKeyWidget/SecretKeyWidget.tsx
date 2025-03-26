import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { ConfirmModal } from "metabase/components/ConfirmModal";
import { UtilApi } from "metabase/services";

import { SettingInput } from "../SettingInput";

import { GenerateButton, SecretKeyWidgetRoot } from "./SecretKeyWidget.styled";

interface SecretKeyWidgetProps {
  id?: string;
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
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const generateToken = async () => {
    const result = await UtilApi.random_token();
    onChange(result.token);
  };

  return (
    <SecretKeyWidgetRoot>
      <SettingInput setting={setting} onChange={onChange} {...(rest as any)} />
      {setting.value ? (
        <>
          <GenerateButton
            primary
            onClick={openModal}
          >{t`Regenerate key`}</GenerateButton>
          <ConfirmModal
            opened={modalOpened}
            title={t`Regenerate embedding key?`}
            content={t`This will cause existing embeds to stop working until they are updated with the new key.`}
            onConfirm={() => {
              generateToken();
              closeModal();
            }}
            onClose={closeModal}
          />
        </>
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
