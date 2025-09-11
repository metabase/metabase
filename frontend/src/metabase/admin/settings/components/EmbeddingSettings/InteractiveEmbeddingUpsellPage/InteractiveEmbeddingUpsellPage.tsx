import { jt, t } from "ttag";

import { UpsellEmbeddingButton } from "metabase/admin/upsells/UpsellEmbeddingButton";
import { UpsellGem } from "metabase/admin/upsells/components";
import ExternalLink from "metabase/common/components/ExternalLink";
import { getPlan } from "metabase/common/utils/plan";
import { useSelector } from "metabase/lib/redux";
import { getDocsUrl, getSetting } from "metabase/selectors/settings";
import { Box, Group, Icon, Text } from "metabase/ui";

import { EmbeddingOption } from "../EmbeddingOption/EmbeddingOption";

import { InteractiveEmbeddingIcon } from "./InteractiveEmbeddingIcon";

export const InteractiveEmbeddingUpsellPage = () => {
  const plan = useSelector((state) =>
    getPlan(getSetting(state, "token-features")),
  );

  const quickStartUrl = useSelector((state) =>
    getDocsUrl(state, {
      page: "embedding/interactive-embedding-quick-start-guide",
      utm: interactiveEmbeddingUtmTags,
    }),
  );

  return (
    <EmbeddingOption
      icon={<InteractiveEmbeddingIcon />}
      title={
        <Group gap="sm">
          <UpsellGem />
          {t`Interactive embedding`}
        </Group>
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
        c="brand"
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
        <UpsellEmbeddingButton
          url="https://www.metabase.com/product/embedded-analytics"
          campaign="embedding-interactive"
          location="embedding-page"
          size="large"
        />
      </Group>
    </EmbeddingOption>
  );
};

const interactiveEmbeddingUtmTags = {
  utm_source: "product",
  utm_medium: "docs",
  utm_campaign: "embedding-interactive",
  utm_content: "embedding-admin",
};
