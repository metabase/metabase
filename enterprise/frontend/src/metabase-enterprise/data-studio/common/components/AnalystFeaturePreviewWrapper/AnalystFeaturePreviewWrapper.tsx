import type { ReactNode } from "react";
import { useMount } from "react-use";
import { t } from "ttag";

import {
  trackUpsellClicked,
  trackUpsellViewed,
} from "metabase/admin/upsells/components/analytics";
import { UpsellCta } from "metabase/admin/upsells/components/UpsellCta";
import { UpsellGem } from "metabase/admin/upsells/components/UpsellGem";
import { useUpsellLink } from "metabase/admin/upsells/components/use-upsell-link";
import { UPGRADE_URL } from "metabase/admin/upsells/constants";
import { Box, Card, Stack, Text, Title } from "metabase/ui";

import S from "./AnalystFeaturePreviewWrapper.module.css";

type Feature = "glossary" | "library" | "dependencies";

type AnalystFeaturePreviewWrapperProps = {
  children: ReactNode;
  feature: Feature;
};

const CAMPAIGN = "data-analyst-preview";

function getUpsellContent(feature: Feature) {
  switch (feature) {
    case "dependencies":
      return {
        title: t`Unlock Dependency Graph`,
        description: t`Understand how your data flows through your organization with interactive lineage visualization.`,
      };
    case "library":
      return {
        title: t`Unlock Library`,
        description: t`Build a library of reusable data assets and share them across your team.`,
      };
    case "glossary":
      return {
        title: t`Unlock Glossary`,
        description: t`Create a shared vocabulary for your organization to ensure everyone speaks the same data language.`,
      };
  }
}

export function AnalystFeaturePreviewWrapper({
  children,
  feature,
}: AnalystFeaturePreviewWrapperProps) {
  const location = `data-studio-${feature}`;
  const { title, description } = getUpsellContent(feature);

  const url = useUpsellLink({
    url: UPGRADE_URL,
    campaign: CAMPAIGN,
    location,
  });

  useMount(() => {
    trackUpsellViewed({ location, campaign: CAMPAIGN });
  });

  return (
    <Box className={S.previewContainer}>
      <Box className={S.blurredContent}>{children}</Box>
      <Box className={S.overlay}>
        <Card className={S.modalCard} p="xl" withBorder>
          <Stack align="center" gap="lg">
            <UpsellGem size={32} />
            <Title order={2} ta="center">
              {title}
            </Title>
            <Text ta="center" c="text-medium">
              {description}
            </Text>
            <UpsellCta
              url={url}
              internalLink={undefined}
              onClick={undefined}
              buttonText={t`Start your trial`}
              onClickCapture={() =>
                trackUpsellClicked({ location, campaign: CAMPAIGN })
              }
            />
            <Text fz="xs" c="text-light">
              {t`14-day free trial`}
            </Text>
          </Stack>
        </Card>
      </Box>
    </Box>
  );
}
