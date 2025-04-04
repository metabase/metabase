import { useDisclosure } from "@mantine/hooks";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Badge } from "metabase/home/components/EmbedHomepage/Badge";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { Flex, Group } from "metabase/ui";

import { EmbeddingSdkLegaleseModal } from "../../../EmbeddingSettings/EmbeddingSdkLegaleseModal";
import type { AdminSettingComponentProps } from "../../../EmbeddingSettings/types";
import { EmbeddingOption } from "../EmbeddingOption";
import { LinkButton } from "../LinkButton";
import { SwitchWithSetByEnvVar } from "../SwitchWithSetByEnvVar";

import { SdkIcon } from "./SdkIcon";

export function EmbeddingSdkOptionCard({
  updateSetting,
}: AdminSettingComponentProps) {
  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");
  const showSdkEmbedTerms = useSetting("show-sdk-embed-terms");
  const isEE = PLUGIN_EMBEDDING.isEnabled();
  function onToggle(value: boolean) {
    updateSetting({ key: "enable-embedding-sdk" }, value);
  }
  const [
    isLegaleseModalOpen,
    { open: openLegaleseModal, close: closeLegaleseModal },
  ] = useDisclosure(false);

  return (
    <EmbeddingOption
      icon={<SdkIcon disabled={!isEmbeddingSdkEnabled} />}
      title={t`Embedded analytics SDK for React`}
      label={
        <Flex gap="sm">
          <Badge
            color="brand"
            fz="sm"
            px="sm"
            py="xs"
            uppercase
          >{t`Pro and Enterprise`}</Badge>
        </Flex>
      }
      description={t`Interactive embedding with full, granular control. Embed and style individual Metabase components in your app, and tailor the experience to each person. Allows for CSS styling, custom user flows, event subscriptions, and more. Only available with SSO via JWT.`}
    >
      <Group justify="space-between" align="center" w="100%">
        <LinkButton to={"/admin/settings/embedding-in-other-applications/sdk"}>
          {!isEE ? t`Try it out` : t`Configure`}
        </LinkButton>
        <SwitchWithSetByEnvVar
          settingKey="enable-embedding-sdk"
          onChange={value =>
            showSdkEmbedTerms && !isEmbeddingSdkEnabled
              ? openLegaleseModal()
              : onToggle(value)
          }
        />
        <EmbeddingSdkLegaleseModal
          opened={isLegaleseModalOpen}
          onClose={closeLegaleseModal}
          updateSetting={updateSetting}
        />
      </Group>
    </EmbeddingOption>
  );
}
