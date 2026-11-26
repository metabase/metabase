import { useState } from "react";
import { t } from "ttag";

import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/common/data-studio/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/common/data-studio/components/PageContainer";
import { PaneHeader } from "metabase/common/data-studio/components/PaneHeader";
import {
  Card,
  Flex,
  Icon,
  Stack,
  TextInput,
  TreeTableSkeleton,
} from "metabase/ui";
import { useListDataAppsQuery } from "metabase-enterprise/api";

import { DataAppBuildGuide } from "./DataAppBuildGuide";
import { DataAppListEmptyState } from "./DataAppListEmptyState";
import { DataAppTable } from "./DataAppTable";

export function DataAppListPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const { data: apps = [], isLoading, error } = useListDataAppsQuery();

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  const isEmpty = !isLoading && apps.length === 0;

  return (
    <PageContainer data-testid="data-app-list" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Data apps`}</DataStudioBreadcrumbs>
        }
      />
      {isEmpty ? (
        <DataAppListEmptyState />
      ) : (
        <Stack style={{ overflow: "hidden" }}>
          {!isLoading && <DataAppBuildGuide />}
          <TextInput
            placeholder={t`Search...`}
            leftSection={<Icon name="search" />}
            bdrs="sm"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <Flex direction="column" flex={1} mih={0}>
            <Card withBorder p={0}>
              {isLoading ? (
                <TreeTableSkeleton columnWidths={[0.3, 0.3, 0.15, 0.2, 0.05]} />
              ) : (
                <DataAppTable
                  apps={apps}
                  searchQuery={searchQuery}
                  onSearchQueryChange={setSearchQuery}
                />
              )}
            </Card>
          </Flex>
        </Stack>
      )}
    </PageContainer>
  );
}
