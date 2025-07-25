import { jt, t } from "ttag";

import ExternalLink from "metabase/common/components/ExternalLink";
import { useSetting } from "metabase/common/hooks";
import { getPlan } from "metabase/common/utils/plan";
import { Badge } from "metabase/home/components/EmbedHomepage/Badge";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { getDocsUrl, getSetting } from "metabase/selectors/settings";
import { Box, Button, Group, Icon, Text } from "metabase/ui";

import { EmbeddingToggle } from "../../EmbeddingToggle";
import { EmbeddingOption } from "../EmbeddingOption";
import { LinkButton } from "../LinkButton";

import { InteractiveEmbeddingIcon } from "./InteractiveEmbeddingIcon";

const interactiveEmbeddingUtmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "embedding-interactive",
  utm_content: "embedding-admin",
};

export const InteractiveEmbeddingOptionCard = () => {
  const isEE = PLUGIN_EMBEDDING.isEnabled();
  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );
  const isInteractiveEmbeddingEnabled = useSetting(
    "enable-embedding-interactive",
  );
  const quickStartUrl = useSelector((state) =>
    getDocsUrl(state, {
      page: "embedding/interactive-embedding-quick-start-guide",
      utm: interactiveEmbeddingUtmTags,
    }),
  );

  return (
    <EmbeddingOption
      icon={
        <InteractiveEmbeddingIcon
          disabled={!isEE || !isInteractiveEmbeddingEnabled}
        />
      }
      title={t`Interactive embedding`}
      label={
        <Badge
          fz="sm"
          px="sm"
          py="xs"
          color="brand"
          uppercase
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
        href={quickStartUrl}
        target="_blank"
      >
        {t`Check out our Quickstart`}{" "}
        <Box ml="sm" top="2.5px" pos="absolute" component="span">
          <Icon name="share" aria-hidden />
        </Box>
      </Text>
      <Group justify="space-between" align="center" w="100%">
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
        <EmbeddingToggle
          settingKey="enable-embedding-interactive"
          disabled={!isEE}
        />
      </Group>
    </EmbeddingOption>
  );
};
