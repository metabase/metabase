import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Badge } from "metabase/home/components/EmbedHomepage/Badge";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { Flex, Group } from "metabase/ui";

import { EmbeddingOption } from "../EmbeddingOption";
import { LinkButton } from "../LinkButton";

import { SdkIcon } from "./SdkIcon";

export function EmbeddingSdkOptionCard() {
  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");
  const isEmbeddingSimpleEnabled = useSetting("enable-embedding-simple");
  const isEE = PLUGIN_EMBEDDING.isEnabled();
  const isAnyEmbeddingEnabled =
    isEmbeddingSdkEnabled || isEmbeddingSimpleEnabled;

  return (
    <EmbeddingOption
      icon={<SdkIcon disabled={!isAnyEmbeddingEnabled} />}
      title={t`Embedded Analytics SDK`}
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
      <Group justify="flex-start" align="center" w="100%">
        <LinkButton to={"/admin/settings/embedding-in-other-applications/sdk"}>
          {!isEE ? t`Try it out` : t`Configure`}
        </LinkButton>
      </Group>
    </EmbeddingOption>
  );
}
