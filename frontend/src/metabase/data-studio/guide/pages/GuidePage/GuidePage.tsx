import { type ReactNode, useEffect } from "react";
import { jt, t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useHasTokenFeature } from "metabase/common/hooks";
import { useUserKeyValue } from "metabase/current-user";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Box, Card, Group, Icon, Stack, Text, Title } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./GuidePage.module.css";

export function GuidePage() {
  usePageTitle(t`Guide`);
  useMarkGuideAsSeen();

  const hasLibraryFeature = useHasTokenFeature("library");

  return (
    <PageContainer className={S.page} gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs role="heading">{t`Guide`}</DataStudioBreadcrumbs>
        }
      />
      <Box className={S.content}>
        <Title mb="xxl" order={2}>
          {t`Build your semantic layer in Data Studio`}
        </Title>

        <Card shadow="none" withBorder>
          <Stack className={S.cardContent} gap="2rem">
            <TransformsSection />
            {hasLibraryFeature ? (
              <SemanticLayerSection />
            ) : (
              <ConnectedDataSection />
            )}
            {hasLibraryFeature ? (
              <LibraryMetricsSection />
            ) : (
              <GlossarySection />
            )}
          </Stack>
        </Card>
      </Box>
    </PageContainer>
  );
}

function TransformsSection() {
  return (
    <GuideSection
      icon="transform"
      title={t`Transform your data to make it easier to query`}
    >
      {jt`Use ${(
        <strong key="transforms">{t`Transforms`}</strong>
      )} to write new tables to your database. Set up ${(
        <strong key="data">{t`Jobs`}</strong>
      )} to schedule transforms, and view each transform’s execution under ${(
        <strong key="jobs">{t`Runs`}</strong>
      )}`}
    </GuideSection>
  );
}

const SemanticLayerSection = () => (
  <GuideSection
    icon="repository"
    title={t`Publish query-ready tables to the Semantic Layer`}
  >
    {jt`Find all your tables in ${(
      <strong key="connected-data">{t`Connected data`}</strong>
    )}. To let people (and agents)  know which tables they should prefer, publish tables to the ${(
      <strong key="semantic-layer">{t`Semantic layer`}</strong>
    )}. Use ${(
      <strong key="segments">{t`Segments`}</strong>
    )} to define canonical filters for these tables,  and ${(
      <strong key="measures">{t`Measures`}</strong>
    )} for key aggregations.`}
  </GuideSection>
);

const LibraryMetricsSection = () => (
  <GuideSection icon="metric" title={t`Define key metrics and terms`}>
    {jt`Build on tables’ segments and measures to define important numbers like KPIs as ${(
      <strong key="metrics">{t`Metrics`}</strong>
    )}. Document terms in the  ${(
      <strong key="glossary">{t`Glossary`}</strong>
    )} to help both your team and your agents understand what they’re looking at.`}
  </GuideSection>
);

// OSS sections
const ConnectedDataSection = () => (
  <GuideSection icon="database" title={t`Add context to your data`}>
    {jt`Find all your tables in ${(
      <strong key="connected-data">{t`Connected data`}</strong>
    )}. Add descriptions to tables and their fields. Use ${(
      <strong key="segments">{t`Segments`}</strong>
    )} to define canonical filters for these tables,  and ${(
      <strong key="measures">{t`Measures`}</strong>
    )} for key aggregations.`}
  </GuideSection>
);

const GlossarySection = () => (
  <GuideSection icon="glossary" title={t`Define key terms in the Glossary`}>
    {jt`Document terms in the  ${(
      <strong key="glossary">{t`Glossary`}</strong>
    )} to help both your team and your agents understand what they’re looking at.`}
  </GuideSection>
);

function useMarkGuideAsSeen() {
  const {
    value: hasSeenGuide,
    setValue: setHasSeenGuide,
    isLoading,
  } = useUserKeyValue({
    namespace: "data_studio",
    key: "hasSeenGuide",
    defaultValue: false,
  });

  useEffect(() => {
    if (!isLoading && !hasSeenGuide) {
      setHasSeenGuide(true);
    }
  }, [isLoading, hasSeenGuide, setHasSeenGuide]);
}

function GuideSection({
  icon,
  title,
  children,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
}) {
  return (
    <Box>
      <Group gap={8} align="center" mb={8} wrap="nowrap">
        <Icon name={icon} size={20} c="core-brand" />
        <Title order={3}>{title}</Title>
      </Group>
      <Stack gap="lg">
        <Text c="text-secondary">{children}</Text>
      </Stack>
    </Box>
  );
}
