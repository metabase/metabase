import { useMemo, useState } from "react";
import { t } from "ttag";

import { SettingsPageWrapper } from "metabase/admin/components/SettingsSection";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { useDebouncedValue } from "metabase/common/hooks/use-debounced-value";
import { Button, Flex, Icon, Stack, TextInput } from "metabase/ui";
import { SEARCH_DEBOUNCE_DURATION } from "metabase/utils/constants";
import type { Workspace } from "metabase-types/api";

import { useFetchWorkspaceList } from "../../hooks/use-fetch-workspace-list";

import { CreateWorkspaceModal } from "./CreateWorkspaceModal";
import { WorkspaceList } from "./WorkspaceList";
import { filterWorkspaces } from "./utils";

export function WorkspaceListPage() {
  const { workspaces, error, isLoading } = useFetchWorkspaceList();

  return (
    <SettingsPageWrapper
      title={t`Workspaces`}
      description={t`Create a workspace to develop transforms in isolation.`}
    >
      {error ? (
        <DelayedLoadingAndErrorWrapper loading={false} error={error} />
      ) : (
        <WorkspaceListPageBody workspaces={workspaces} isLoading={isLoading} />
      )}
    </SettingsPageWrapper>
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
  const [isModalOpen, setIsModalOpen] = useState(false);
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
    <Stack>
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
          onClick={() => setIsModalOpen(true)}
        >{t`New`}</Button>
      </Flex>
      <WorkspaceList
        workspaces={filteredWorkspaces}
        isFiltered={isFiltered}
        isLoading={isLoading}
      />
      {isModalOpen && (
        <CreateWorkspaceModal onClose={() => setIsModalOpen(false)} />
      )}
    </Stack>
  );
}
