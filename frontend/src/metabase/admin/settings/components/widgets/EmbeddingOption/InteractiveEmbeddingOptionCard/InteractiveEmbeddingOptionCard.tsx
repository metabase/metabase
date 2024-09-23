import { jt, t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import ExternalLink from "metabase/core/components/ExternalLink";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { getDocsUrl, getSetting } from "metabase/selectors/settings";
import { Badge, Box, Button, Flex, Icon, Switch, Text } from "metabase/ui";

import { EmbeddingOption } from "../EmbeddingOption";
import { LinkButton } from "../LinkButton";
import type { EmbeddingOptionCardProps } from "../types";

import { InteractiveEmbeddingIcon } from "./InteractiveEmbeddingIcon";

export const InteractiveEmbeddingOptionCard = ({
  onToggle,
}: EmbeddingOptionCardProps) => {
  const isEE = PLUGIN_EMBEDDING.isEnabled();
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );
  const isInteractiveEmbeddingEnabled = useSetting(
    "enable-embedding-interactive",
  );
  const quickStartUrl = useSelector(state =>
    getDocsUrl(state, {
      page: "embedding/interactive-embedding-quick-start-guide",
    }),
  );

  const quickStartLinkWithUtm = `${quickStartUrl}?utm_source=${plan}&utm_media=embed-settings`;

  return (
    <EmbeddingOption
      icon={
        <InteractiveEmbeddingIcon
          disabled={isEE && !isInteractiveEmbeddingEnabled}
        />
      }
      title={t`Interactive embedding`}
      label={
        <Badge
          h="100%"
          fz="sm"
          px="sm"
          radius="xs"
          tt="uppercase"
          c="white"
        >{t`Pro and Enterprise`}</Badge>
      }
      description={jt`Use interactive embedding when you want to ${(
        <ExternalLink
          href={`https://www.metabase.com/blog/why-full-app-embedding?utm_source=${plan}&utm_media=embed-settings`}
          key="why-full-app-embedding"
        >
          {t`offer multi-tenant, self-service analytics`}
        </ExternalLink>
      )} and people want to create their own questions, dashboards, models, and more, all in their own data sandbox.`}
    >
      <Text
        fw="bold"
        color="brand"
        component="a"
        pos="relative"
        href={quickStartLinkWithUtm}
        target="_blank"
      >
        {t`Check out our Quick Start`}{" "}
        <Box ml="sm" top="2.5px" pos="absolute" component="span">
          <Icon name="share" aria-hidden />
        </Box>
      </Text>
      <Flex align="center" w="100%">
        {isEE ? (
          <LinkButton
            to={"/admin/settings/embedding-in-other-applications/full-app"}
          >
            {t`Configure`}
          </LinkButton>
        ) : (
          <Button
            component={ExternalLink}
            href={`https://www.metabase.com/product/embedded-analytics?utm_source=${plan}&utm_media=embed-settings`}
          >
            {t`Learn More`}
          </Button>
        )}
        <Switch
          size="sm"
          label={isInteractiveEmbeddingEnabled ? t`Enabled` : t`Disabled`}
          ml="auto"
          labelPosition="left"
          disabled={!isEE}
          checked={isInteractiveEmbeddingEnabled}
          onChange={onToggle}
        />
      </Flex>
    </EmbeddingOption>
  );
};
