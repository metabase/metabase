import { t } from "ttag";

import { Box, Card, Stack, Text, Title } from "metabase/ui";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

import { HeaderWithDismiss } from "./HeaderWithDismiss";
import { InteractiveContent } from "./InteractiveContent";
import { NeedMoreInfoCard } from "./NeedMoreInfoCard";
import { SDKContent } from "./SDKContent";
import { StaticEmbedContent } from "./StaticEmbedContent";

export type EmbedHomepageViewProps = {
  exampleDashboardId: number | null;
  licenseActiveAtSetup: boolean;
  onDismiss: (reason: EmbeddingHomepageDismissReason) => void;
  // links
  interactiveEmbeddingQuickstartUrl: string;
  learnMoreInteractiveEmbedUrl: string;
  learnMoreStaticEmbedUrl: string;
  sdkQuickstartUrl: string;
  sdkDocsUrl: string;
  embeddingDocsUrl: string;
  analyticsDocsUrl: string;
};

export const EmbedHomepageView = (props: EmbedHomepageViewProps) => {
  const {
    interactiveEmbeddingQuickstartUrl,
    exampleDashboardId,
    learnMoreStaticEmbedUrl,
    learnMoreInteractiveEmbedUrl,
    sdkQuickstartUrl,
    sdkDocsUrl,
    onDismiss,
    embeddingDocsUrl,
    analyticsDocsUrl,
  } = props;

  const exampleDashboardLink = exampleDashboardId
    ? `/dashboard/${exampleDashboardId}`
    : undefined;

  return (
    <Stack maw={550}>
      <HeaderWithDismiss onDismiss={onDismiss} />

      <Card px="xl" py="lg">
        <Stack gap="xl">
          <Box>
            {/* eslint-disable-next-line no-literal-metabase-strings -- only visible to admins */}
            <Title order={2} mb="md">{t`Embedding Metabase`}</Title>
            <Text>
              {/* eslint-disable-next-line no-literal-metabase-strings -- only visible to admins */}
              {t`Give your customers secure, multi-tenant access to their data with as much (or as little) interactivity and tools to explore data as you want, with as much customization as you need. Embed dashboards, charts—even Metabase's query editor—with iframes or as individual React components.`}
            </Text>
          </Box>

          <StaticEmbedContent
            exampleDashboardLink={exampleDashboardLink}
            learnMoreStaticEmbedUrl={learnMoreStaticEmbedUrl}
          />

          <SDKContent
            sdkQuickstartUrl={sdkQuickstartUrl}
            sdkDocsUrl={sdkDocsUrl}
          />

          <InteractiveContent
            interactiveEmbeddingQuickstartUrl={
              interactiveEmbeddingQuickstartUrl
            }
            learnMoreInteractiveEmbedUrl={learnMoreInteractiveEmbedUrl}
          />
        </Stack>
      </Card>

      <NeedMoreInfoCard
        embeddingDocsUrl={embeddingDocsUrl}
        analyticsDocsUrl={analyticsDocsUrl}
      />
    </Stack>
  );
};
