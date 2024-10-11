import { t } from "ttag";

import { getPlan } from "metabase/common/utils/plan";
import Link from "metabase/core/components/Link";
import { useSelector } from "metabase/lib/redux";
import { PLUGIN_EMBEDDING } from "metabase/plugins";
import { getSetting } from "metabase/selectors/settings";
import { Box, Group, Stack, Text } from "metabase/ui";

import {
  CTAContainer,
  CTAHeader,
  ClickIcon,
  ProBadge,
} from "./InteractiveEmbeddingCTA.styled";

const useCTAText = () => {
  const isInteractiveEmbeddingEnabled = useSelector(
    PLUGIN_EMBEDDING.isInteractiveEmbeddingEnabled,
  );
  const plan = useSelector(state =>
    getPlan(getSetting(state, "token-features")),
  );

  if (isInteractiveEmbeddingEnabled) {
    return {
      showProBadge: false,
      description: t`Your plan allows you to use Interactive Embedding create interactive embedding experiences with drill-through and more.`,
      linkText: t`Set it up`,
      url: "/admin/settings/embedding-in-other-applications/full-app",
    };
  }

  return {
    showProBadge: true,
    // eslint-disable-next-line no-literal-metabase-strings -- This only shows for admins
    description: t`Give your customers the full power of Metabase in your own app, with SSO, advanced permissions, customization, and more.`,
    linkText: t`Learn more`,
    url: `https://www.metabase.com/product/embedded-analytics?${new URLSearchParams(
      {
        utm_source: "product",
        utm_medium: "upsell",
        utm_campaign: "embedding-interactive",
        utm_content: "static-embed-popover",
        source_plan: plan,
      },
    )}`,
    target: "_blank",
  };
};

export const InteractiveEmbeddingCTA = () => {
  const { showProBadge, description, linkText, url, target } = useCTAText();

  const badge = (
    // TODO: Check padding because design keeps using non-mantine-standard units
    <Box pos="relative">
      <ProBadge
        bg="brand"
        py="0.125rem"
        px="0.375rem"
        pos="absolute"
        top="-0.6rem"
      >
        <Text
          align="center"
          c="text-white"
          span
          tt="uppercase"
          lts="0.7"
          size="sm"
          fw={700}
        >{t`Pro`}</Text>
      </ProBadge>
    </Box>
  );

  return (
    <Link to={url} target={target} data-testid="interactive-embedding-cta">
      <CTAContainer withBorder p="md">
        <Group gap="md" align="flex-start">
          <Box mt="-0.2rem">
            <ClickIcon name="click" size={32} />
          </Box>
          <Stack gap="sm">
            <Group gap="sm">
              <CTAHeader
                inline
                fz="md"
                order={5}
              >{t`Interactive Embedding`}</CTAHeader>
              {showProBadge && badge}
            </Group>
            <Text inline lh="unset" fz="sm">
              {description}
              {"  "}
              <Text inline inherit span color="brand" fw={700}>
                {linkText}
              </Text>
            </Text>
          </Stack>
        </Group>
      </CTAContainer>
    </Link>
  );
};
