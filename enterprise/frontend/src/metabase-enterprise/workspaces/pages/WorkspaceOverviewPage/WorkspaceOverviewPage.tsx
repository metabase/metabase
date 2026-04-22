import { skipToken } from "metabase/api";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useGetWorkspaceQuery } from "metabase-enterprise/api";

import { WorkspaceHeader } from "../../components/WorkspaceHeader";
import { WorkspaceStatusSection } from "../../components/WorkspaceStatusSection";

type WorkspaceOverviewPageParams = {
  workspaceId: string;
};

type WorkspaceOverviewPageProps = {
  params: WorkspaceOverviewPageParams;
};

export function WorkspaceOverviewPage({ params }: WorkspaceOverviewPageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);
  const {
    data: workspace,
    isLoading,
    error,
  } = useGetWorkspaceQuery(workspaceId ?? skipToken);

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
