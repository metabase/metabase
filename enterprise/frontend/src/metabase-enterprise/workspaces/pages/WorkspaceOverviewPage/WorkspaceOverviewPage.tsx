import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";

import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { useFetchWorkspace } from "../../hooks/use-fetch-workspace";

import { WorkspaceStatusSection } from "./WorkspaceStatusSection";

type WorkspaceOverviewPageParams = {
  workspaceId: string;
};

type WorkspaceOverviewPageProps = {
  params: WorkspaceOverviewPageParams;
};

export function WorkspaceOverviewPage({ params }: WorkspaceOverviewPageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);
  const { workspace, isLoading, error } = useFetchWorkspace(workspaceId);

  if (isLoading || error != null || workspace == null) {
    return (
      <Center h="100%">
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <PageContainer data-testid="workspace-overview-page" gap="2.5rem">
      <WorkspaceHeader workspace={workspace} />
      <Stack gap="3.5rem">
        <WorkspaceStatusSection workspace={workspace} />
      </Stack>
    </PageContainer>
  );
}
