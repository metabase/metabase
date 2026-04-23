import { useMemo, useState } from "react";
import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Button, Flex, Icon, Stack, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import * as Urls from "metabase/utils/urls";
import type { Workspace } from "metabase-types/api";

import { useFetchWorkspaceList } from "../../hooks/use-fetch-workspace-list";

import { WorkspaceList } from "./WorkspaceList";
import { filterWorkspaces } from "./utils";

export function WorkspaceListPage() {
  const { workspaces, error, isLoading } = useFetchWorkspaceList();

  if (error) {
    return <DelayedLoadingAndErrorWrapper loading={false} error={error} />;
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
