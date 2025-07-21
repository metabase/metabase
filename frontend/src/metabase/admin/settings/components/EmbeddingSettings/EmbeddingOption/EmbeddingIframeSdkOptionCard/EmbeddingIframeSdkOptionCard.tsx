import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Badge } from "metabase/home/components/EmbedHomepage/Badge";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { Flex, Group } from "metabase/ui";

import { EmbeddingToggle } from "../../EmbeddingToggle";
import { EmbeddingOption } from "../EmbeddingOption";
import { LinkButton } from "../LinkButton";

import { IframeSdkIcon } from "./IframeSdkIcon";

export function EmbeddingIframeSdkOptionCard() {
  const isIframeEmbeddingSdkEnabled = useSetting("enable-embedding-iframe-sdk");
  const isEE = PLUGIN_EMBEDDING.isEnabled();

  return (
    <EmbeddingOption
      icon={<IframeSdkIcon disabled={!isIframeEmbeddingSdkEnabled} />}
      title={t`Embedded analytics SDK for iframe`}
      label={
        <Flex gap="sm">
          <Badge
            color="brand"
            fz="sm"
            px="sm"
            py="xs"
            uppercase
          >{t`Pro and Enterprise`}</Badge>

          <Badge
            color="gray"
            fz="sm"
            px="sm"
            py="xs"
            uppercase
          >{t`Beta`}</Badge>
        </Flex>
      }
      description={t`Embed Metabase components within iframes using the SDK. Provides similar functionality to the React SDK but uses iframes for easier integration across different frameworks. Supports SSO via JWT with iframe-specific settings and configurations.`}
    >
      <Group justify="space-between" align="center" w="100%">
        <LinkButton
          to={"/admin/settings/embedding-in-other-applications/iframe-sdk"}
        >
          {!isEE ? t`Try it out` : t`Configure`}
        </LinkButton>

        <EmbeddingToggle settingKey="enable-embedding-iframe-sdk" />
      </Group>
    </EmbeddingOption>
  );
}
