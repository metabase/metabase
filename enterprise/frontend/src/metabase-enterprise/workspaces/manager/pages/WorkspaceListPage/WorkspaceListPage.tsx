import { useDisclosure } from "@mantine/hooks";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Button, Flex, Icon, Stack, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import { useListWorkspacesQuery } from "metabase-enterprise/api";
import type { Workspace } from "metabase-types/api";

import { CreateWorkspaceModal } from "./CreateWorkspaceModal";
import { WorkspaceList } from "./WorkspaceList";
import { filterWorkspaces } from "./utils";

export function WorkspaceListPage() {
  const { data: workspaces = [], error, isLoading } = useListWorkspacesQuery();

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
      <WorkspaceListPageBody workspaces={workspaces} loading={isLoading} />
    </PageContainer>
  );
}

type WorkspaceListPageBodyProps = {
  workspaces: Workspace[];
  loading: boolean;
};

function WorkspaceListPageBody({
  workspaces,
  loading,
}: WorkspaceListPageBodyProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreateOpened, { open: openCreate, close: closeCreate }] =
    useDisclosure(false);
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
          variant={workspaces.length === 0 ? "filled" : "default"}
          leftSection={<Icon name="add" />}
          onClick={openCreate}
        >{t`New`}</Button>
      </Flex>
      <Flex direction="column" flex={1} mih={0}>
        <WorkspaceList
          workspaces={filteredWorkspaces}
          filtered={isFiltered}
          loading={loading}
        />
      </Flex>
      <CreateWorkspaceModal opened={isCreateOpened} onClose={closeCreate} />
    </Stack>
  );
}
