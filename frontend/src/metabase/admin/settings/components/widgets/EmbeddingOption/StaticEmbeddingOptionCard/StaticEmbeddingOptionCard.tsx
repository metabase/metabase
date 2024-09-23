import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { getUpgradeUrl } from "metabase/selectors/settings";
import { Flex, Switch, Text } from "metabase/ui";

import { EmbeddingOption } from "../EmbeddingOption";
import { LinkButton } from "../LinkButton";
import { StaticEmbeddingIcon } from "../icons";
import type { EmbeddingOptionCardProps } from "../types";

export const StaticEmbeddingOptionCard = ({
  onToggle,
}: EmbeddingOptionCardProps) => {
  const isStaticEmbeddingEnabled = useSetting("enable-embedding-static");
  const upgradeUrl = useSelector(state =>
    getUpgradeUrl(state, { utm_content: "embed-settings" }),
  );
  const shouldPromptToUpgrade = !PLUGIN_EMBEDDING.isEnabled();

  const upgradeText = jt`A "powered by Metabase" banner appears on static embeds. You can ${(
    <ExternalLink key="upgrade-link" href={upgradeUrl}>
      {t`upgrade to a paid plan`}
    </ExternalLink>
  )} to remove it.`;

  return (
    <EmbeddingOption
      icon={<StaticEmbeddingIcon disabled={!isStaticEmbeddingEnabled} />}
      title={t`Static embedding`}
      description={jt`Use static embedding when you don’t want to give people ad hoc query access to their data for whatever reason, or you want to present data that applies to all of your tenants at once.${
        shouldPromptToUpgrade && (
          <Text size="sm" mt="xs" key="upgrade-text">
            {upgradeText}
          </Text>
        )
      }`}
    >
      <Flex align="center" w="100%">
        <LinkButton
          variant="default"
          to={"/admin/settings/embedding-in-other-applications/standalone"}
        >
          {t`Manage`}
        </LinkButton>
        <Switch
          size="sm"
          label={isStaticEmbeddingEnabled ? t`Enabled` : t`Disabled`}
          ml="auto"
          labelPosition="left"
          checked={isStaticEmbeddingEnabled}
          onChange={onToggle}
        />
      </Flex>
    </EmbeddingOption>
  );
};
