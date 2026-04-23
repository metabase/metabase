import { useMemo, useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Button, Flex, Icon, Stack, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import * as Urls from "metabase/utils/urls";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { WorkspaceList } from "./WorkspaceList";

export function WorkspaceListPage() {
  const { data: workspaces = [], error, isLoading } = useListWorkspacesQuery();

  if (error) {
    return <LoadingAndErrorWrapper loading={false} error={error} />;
  }

  return (
    <PageContainer data-testid="workspace-list-page" gap={0}>
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspaces`}</DataStudioBreadcrumbs>
        }
        py={0}
        showMetabotButton
      />
      <WorkspaceListPageBody workspaces={workspaces} isLoading={isLoading} />
    </PageContainer>
  );
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
  isLoading: boolean;
};

function WorkspaceListPageBody({
  workspaces,
  isLoading,
}: WorkspaceListPageBodyProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(
    searchQuery.trim(),
    SEARCH_DEBOUNCE_DURATION,
  );

  const filteredWorkspaces = useMemo(
    () => filterWorkspaces(workspaces, debouncedQuery),
    [workspaces, debouncedQuery],
  );
  const isFiltered = debouncedQuery.length > 0;

  return (
    <Stack style={{ overflow: "hidden" }}>
      <Flex gap="0.5rem">
        <TextInput
          placeholder={t`Search...`}
          leftSection={<Icon name="search" />}
          bdrs="md"
          flex="1"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
        />
        <Button
          leftSection={<Icon name="add" />}
          component={ForwardRefLink}
          to={Urls.newWorkspace()}
        >{t`New`}</Button>
      </Flex>
      <Flex direction="column" flex={1} mih={0}>
        <WorkspaceList
          workspaces={filteredWorkspaces}
          isFiltered={isFiltered}
          isLoading={isLoading}
        />
      </Flex>
    </Stack>
  );
}

function filterWorkspaces(workspaces: Workspace[], query: string): Workspace[] {
  if (query.length === 0) {
    return workspaces;
  }
  const lowercaseQuery = query.toLowerCase();
  return workspaces.filter((workspace) =>
    workspace.name.toLowerCase().includes(lowercaseQuery),
  );
}
