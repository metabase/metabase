import { useDisclosure } from "@mantine/hooks";

import { useSetting } from "metabase/common/hooks";
import { useDispatch } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING_SDK } from "metabase/plugins";
import { Button } from "metabase/ui";

import { SwitchWithSetByEnvVar } from "../../widgets/EmbeddingOption";
import { EmbeddingSdkLegaleseModal } from "../EmbeddingSdkLegaleseModal";

export const EmbeddingSdkEnvVarSwitch = ({ updateSetting, ...switchProps }) => {
  const handleToggleEmbeddingSdk = (value: boolean) => {
    updateSetting({ key: "enable-embedding-sdk" }, value);
  };

  const handleShowSdkTermsSetting = (value: boolean) => {
    console.log({ key: "show-sdk-embed-terms", value });
    updateSetting({ key: "show-sdk-embed-terms" }, value);
  };

  const hasSdkTokenFeature = PLUGIN_EMBEDDING_SDK.isEnabled();
  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");
  const showSdkTerms = useSetting("show-sdk-embed-terms");

  const [opened, { open, close }] = useDisclosure(
    Boolean(isEmbeddingSdkEnabled && showSdkTerms),
  );

  const onDecline = () => {
    console.log("onDecline");
    handleToggleEmbeddingSdk(false);
    handleShowSdkTermsSetting(true);
    close();
  };

  const onAccept = () => {
    console.log("onAccept");
    handleToggleEmbeddingSdk(true);
    handleShowSdkTermsSetting(false);
    close();
  };
  console.log(isEmbeddingSdkEnabled, showSdkTerms);
  return (
    <>
      <SwitchWithSetByEnvVar
        settingKey="enable-embedding-sdk"
        onChange={
          !isEmbeddingSdkEnabled && showSdkTerms
            ? open
            : handleToggleEmbeddingSdk
        }
        disabled={!hasSdkTokenFeature}
        {...switchProps}
      />
      <Button
        onClick={() => {
          updateSetting({ key: "show-sdk-embed-terms", value: true });
        }}
      >
        reset
      </Button>
      <EmbeddingSdkLegaleseModal
        onAccept={onAccept}
        onDecline={onDecline}
        opened={opened}
        onClose={onDecline}
      />
    </>
  );
};
