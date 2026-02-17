import { match } from "ts-pattern";
import { t } from "ttag";

import { UpsellEmbedHomepage } from "metabase/admin/upsells";
import { Box, Card, Flex, Stack, Text, Title } from "metabase/ui";
import type { EmbeddingHomepageDismissReason } from "metabase-types/api";

import { EmbedJsContent } from "./EmbedJsContent";
import { HeaderWithDismiss } from "./HeaderWithDismiss";
import { NeedMoreInfoCard } from "./NeedMoreInfoCard";
import { SDKContent } from "./SDKContent";
import { StaticEmbedContent } from "./StaticEmbedContent";

export type EmbedHomepageViewProps = {
  exampleDashboardId: number | null;
  variant: "oss" | "ee";
  hasEmbeddingFeature: boolean;
  onDismiss: (reason: EmbeddingHomepageDismissReason) => void;
  // links
  learnMoreInteractiveEmbedUrl: string;
  learnMoreStaticEmbedUrl: string;
  sdkQuickstartUrl: string;
  sdkDocsUrl: string;
  embedJsDocsUrl: string;
  embeddingDocsUrl: string;
  analyticsDocsUrl: string;
};

export const EmbedHomepageView = (props: EmbedHomepageViewProps) => {
  const {
    exampleDashboardId,
    learnMoreStaticEmbedUrl,
    sdkQuickstartUrl,
    sdkDocsUrl,
    embedJsDocsUrl,
    onDismiss,
    embeddingDocsUrl,
    analyticsDocsUrl,
    variant,
    hasEmbeddingFeature,
  } = props;

  const exampleDashboardLink = exampleDashboardId
    ? `/dashboard/${exampleDashboardId}`
    : undefined;

  const content = match(variant)
    .with("oss", () => {
      return (
        <>
          <StaticEmbedContent
            exampleDashboardLink={exampleDashboardLink}
            learnMoreStaticEmbedUrl={learnMoreStaticEmbedUrl}
            showImage
          />

          <EmbedJsContent
            variant={variant}
            embedJsDocsUrl={embedJsDocsUrl}
            hasEmbeddingFeature={hasEmbeddingFeature}
          />

          <SDKContent
            sdkQuickstartUrl={sdkQuickstartUrl}
            sdkDocsUrl={sdkDocsUrl}
          />
        </>
      );
    })
    .with("ee", () => {
      return (
        <>
          <EmbedJsContent
            variant={variant}
            embedJsDocsUrl={embedJsDocsUrl}
            hasEmbeddingFeature={hasEmbeddingFeature}
            showImage
          />

          <SDKContent
            sdkQuickstartUrl={sdkQuickstartUrl}
            sdkDocsUrl={sdkDocsUrl}
          />

          <StaticEmbedContent
            exampleDashboardLink={exampleDashboardLink}
            learnMoreStaticEmbedUrl={learnMoreStaticEmbedUrl}
          />
        </>
      );
    })
    .exhaustive();

  return (
    <Flex gap="lg" align="flex-start" maw={1000}>
      <Stack maw={550}>
        <HeaderWithDismiss onDismiss={onDismiss} />

        <Card px="xl" py="lg">
          <Stack gap="xl">
            <Box>
              {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- only visible to admins */}
              <Title order={2} mb="md">{t`Embedding Metabase`}</Title>
              <Text>
                {/* eslint-disable-next-line metabase/no-literal-metabase-strings -- only visible to admins */}
                {t`Give your customers secure, multi-tenant access to their data with as much (or as little) interactivity and tools to explore data as you want, with as much customization as you need. Embed dashboards, charts—even Metabase's query editor—with iframes or as individual React components.`}
              </Text>
            </Box>
            {content}
          </Stack>
        </Card>

        <NeedMoreInfoCard
          embeddingDocsUrl={embeddingDocsUrl}
          analyticsDocsUrl={analyticsDocsUrl}
        />
      </Stack>

      {variant === "oss" && (
        <Box mt="2.5rem">
          <UpsellEmbedHomepage location="embedding-homepage" />
        </Box>
      )}
    </Flex>
  );
};
