import { type ReactNode, useEffect } from "react";
import { jt, t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { Box, Card, Group, Icon, Stack, Text, Title } from "metabase/ui";
import type { IconName } from "metabase-types/api";

import S from "./GuidePage.module.css";

export function GuidePage() {
  usePageTitle(t`Guide`);
  useMarkGuideAsSeen();

  return (
    <PageContainer className={S.page} gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs role="heading">{t`Guide`}</DataStudioBreadcrumbs>
        }
      />
      <Box className={S.content}>
        <Title mb="xl" order={2}>
          {t`Build your semantic layer in Data Studio`}
        </Title>

        <Card shadow="none" withBorder>
          <Stack className={S.cardContent} gap="2rem">
            <Box>
              <SectionHeading icon="transform">
                {t`Transform your data to make it easier to query`}
              </SectionHeading>
              <Stack gap="md">
                <Text c="text-secondary">
                  {jt`Use ${(
                    <strong key="transforms">{t`Transforms`}</strong>
                  )} to write new tables to your database. Set up ${(
                    <strong key="data">{t`Jobs`}</strong>
                  )} to schedule transforms, and view each transform’s execution under ${(
                    <strong key="jobs">{t`Runs`}</strong>
                  )}`}
                </Text>
              </Stack>
            </Box>

            <Box>
              <SectionHeading icon="repository">
                {t`Publish query-ready tables to the Semantic Layer`}
              </SectionHeading>
              <Stack gap="md">
                <Text c="text-secondary">
                  {jt`Find all your tables in ${(
                    <strong key="connected-data">{t`Connected data`}</strong>
                  )}. To let people (and agents)  know which tables they should prefer, publish tables to the ${(
                    <strong key="semantic-layer">{t`Semantic layer`}</strong>
                  )}. Use ${(
                    <strong key="segments">{t`Segments`}</strong>
                  )} to define canonical filters for these tables,  and ${(
                    <strong key="measures">{t`Measures`}</strong>
                  )} for key aggregations.`}
                </Text>
              </Stack>
            </Box>

            <Box>
              <SectionHeading icon="metric">
                {t`Define key metrics and terms`}
              </SectionHeading>
              <Stack gap="md">
                <Text c="text-secondary">
                  {jt`Build on tables’ segments and measures to define important numbers like KPIs as ${(
                    <strong key="metrics">{t`Metrics`}</strong>
                  )}. Document terms in the  ${(
                    <strong key="glossary">{t`Glossary`}</strong>
                  )} to help both your team and your agents understand what they’re looking at.`}
                </Text>
              </Stack>
            </Box>
          </Stack>
        </Card>
      </Box>
    </PageContainer>
  );
}

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

function SectionHeading({
  icon,
  children,
}: {
  icon: IconName;
  children: ReactNode;
}) {
  return (
    <Group gap={8} align="center" mb={8} wrap="nowrap">
      <Icon name={icon} size={20} c="core-brand" />
      <Title order={3}>{children}</Title>
    </Group>
  );
}
