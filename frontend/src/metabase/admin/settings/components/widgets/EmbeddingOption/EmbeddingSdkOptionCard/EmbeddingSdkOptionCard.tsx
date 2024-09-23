import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { Badge, Flex, Switch } from "metabase/ui";

import { EmbeddingOption } from "../EmbeddingOption";
import { LinkButton } from "../LinkButton";
import type { EmbeddingOptionCardProps } from "../types";

import { SdkIcon } from "./SdkIcon";

export function EmbeddingSdkOptionCard({ onToggle }: EmbeddingOptionCardProps) {
  const isEmbeddingSdkEnabled = useSetting("enable-embedding-sdk");
  const isEE = PLUGIN_EMBEDDING.isEnabled();

  return (
    <EmbeddingOption
      icon={<SdkIcon disabled={!isEmbeddingSdkEnabled} />}
      title={t`Embedded analytics SDK`}
      label={
        <Flex gap="sm">
          <Badge
            h="100%"
            fz="sm"
            px="sm"
            radius="xs"
            tt="uppercase"
            c="white"
          >{t`Pro and Enterprise`}</Badge>
          <Badge
            h="100%"
            fz="sm"
            px="sm"
            radius="xs"
            tt="uppercase"
            c="text-dark"
            bg="bg-medium"
            variant="filled"
          >{t`Beta`}</Badge>
        </Flex>
      }
      description={t`Interactive embedding with full, granular control. Embed and style individual Metabase components in your app, and tailor the experience to each person. Allows for CSS styling, custom user flows, event subscriptions, and more. Only available with SSO via JWT.`}
    >
      <Flex align="center" w="100%">
        <LinkButton to={"/admin/settings/embedding-in-other-applications/sdk"}>
          {!isEE ? t`Try it out` : t`Configure`}
        </LinkButton>
        <Switch
          size="sm"
          label={isEmbeddingSdkEnabled ? t`Enabled` : t`Disabled`}
          ml="auto"
          labelPosition="left"
          checked={isEmbeddingSdkEnabled}
          onChange={onToggle}
        />
      </Flex>
    </EmbeddingOption>
  );
}
