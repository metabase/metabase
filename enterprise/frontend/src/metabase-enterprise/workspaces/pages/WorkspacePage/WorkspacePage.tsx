import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import type { Workspace } from "metabase-types/api";

import { useFetchWorkspace } from "../../hooks/use-fetch-workspace";

import { DangerSection } from "./DangerSection";
import { DatabaseMappingSection } from "./DatabaseMappingSection";
import { StatusSection } from "./StatusSection";
import { WorkspaceHeader } from "./WorkspaceHeader";

type WorkspacePageProps = {
  params: { workspaceId: string };
};

export function WorkspacePage({ params }: WorkspacePageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);
  const { workspace, isLoading, error } = useFetchWorkspace(workspaceId);

  if (isLoading || error != null || workspace == null) {
    return (
      <Center h="100%">
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return <WorkspacePageBody workspace={workspace} />;
}

type WorkspacePageBodyProps = {
  workspace: Workspace;
};

function WorkspacePageBody({ workspace }: WorkspacePageBodyProps) {
  return (
    <Stack gap="3.25rem">
      <WorkspaceHeader workspace={workspace} />
      <StatusSection workspace={workspace} />
      <DatabaseMappingSection workspace={workspace} />
      <DangerSection workspace={workspace} />
    </Stack>
  );
}
