import { useMount } from "react-use";
import { t } from "ttag";

import { useUpgradeAction } from "metabase/common/components/upsells/components/UpgradeModal";
import { UpsellCta } from "metabase/common/components/upsells/components/UpsellCta";
import { UpsellGem } from "metabase/common/components/upsells/components/UpsellGem";
import { UpsellWrapper } from "metabase/common/components/upsells/components/UpsellWrapper";
import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "metabase/common/components/upsells/components/analytics";
import { UPGRADE_URL } from "metabase/common/components/upsells/constants";
import { useHasTokenFeature } from "metabase/common/hooks";
import { Box, Card, Flex, Stack, Text, Title } from "metabase/ui";

type Props = { source: string };

const UpsellEmbeddingThemeInner = ({ source }: Props) => {
  const hasSimpleEmbedding = useHasTokenFeature("embedding_simple");
  const campaign = "embedding-themes";

  const { onClick: upgradeOnClick, url: upgradeUrl } = useUpgradeAction({
    url: UPGRADE_URL,
    campaign,
    location: source,
  });

  useMount(() => {
    trackUpsellViewed({ location: source, campaign });
  });

  if (hasSimpleEmbedding) {
    return null;
  }

  return (
    <Card data-testid="upsell-embedding-theme" p="xl" withBorder>
      <Stack gap="md">
        <Flex align="center" gap="xs">
          <UpsellGem.New size={16} />
          <Text c="text-brand">{t`Metabase Pro`}</Text>
        </Flex>
        <Title order={3}>{t`Create custom themes`}</Title>
        <Text lh={1.4}>
          {t`Fine-tune the appearance of your embedded content with colors and fonts.`}
        </Text>
        <Text lh={1.4}>
          {t`Get a 14 day trial of this and other Pro features.`}
        </Text>
        <Box mt="sm">
          <UpsellCta
            onClick={upgradeOnClick}
            url={upgradeUrl}
            internalLink={undefined}
            buttonText={t`Upgrade to Pro`}
            onClickCapture={() =>
              trackUpsellClicked({ location: source, campaign })
            }
            size="large"
          />
        </Box>
      </Stack>
    </Card>
  );
};

export const UpsellEmbeddingTheme = UpsellWrapper(UpsellEmbeddingThemeInner);
