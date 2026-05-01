import { t } from "ttag";

import { skipToken } from "metabase/api";
import { DelayedLoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper/DelayedLoadingAndErrorWrapper";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { Center, Stack } from "metabase/ui";
import * as Urls from "metabase/urls";
import {
  useGetWorkspaceQuery,
  useListWorkspaceAccessKeyLogsQuery,
} from "metabase-enterprise/api";
import { TitleSection } from "metabase-enterprise/workspaces/common/components/TitleSection";
import type { Workspace, WorkspaceAccessKeyLog } from "metabase-types/api";

import { WorkspaceHeader } from "../WorkspaceSetupPage/WorkspaceHeader";

import { AccessKeyLogTable } from "./AccessKeyLogTable";
import { AccessKeySection } from "./AccessKeySection";

const DEFAULT_LIMIT = 25;

type WorkspaceAccessKeysPageProps = {
  params: { workspaceId: string };
};

export function WorkspaceAccessKeysPage({
  params,
}: WorkspaceAccessKeysPageProps) {
  const workspaceId = Urls.extractEntityId(params.workspaceId);

  const {
    data: workspace,
    isLoading: isLoadingWorkspace,
    error: workspaceError,
  } = useGetWorkspaceQuery(workspaceId ?? skipToken);

  const {
    data: logsResponse,
    isLoading: isLoadingLogs,
    error: logsError,
  } = useListWorkspaceAccessKeyLogsQuery(
    workspaceId == null
      ? skipToken
      : { id: workspaceId, limit: DEFAULT_LIMIT, offset: 0 },
  );

  const isLoading = isLoadingWorkspace || isLoadingLogs;
  const error = workspaceError ?? logsError;

  if (isLoading || error != null || workspace == null || logsResponse == null) {
    return (
      <Center h="100%">
        <DelayedLoadingAndErrorWrapper loading={isLoading} error={error} />
      </Center>
    );
  }

  return (
    <WorkspaceAccessKeysPageBody
      workspace={workspace}
      logs={logsResponse.data}
    />
  );
}

type WorkspaceAccessKeysPageBodyProps = {
  workspace: Workspace;
  logs: WorkspaceAccessKeyLog[];
};

function WorkspaceAccessKeysPageBody({
  workspace,
  logs,
}: WorkspaceAccessKeysPageBodyProps) {
  return (
    <PageContainer data-testid="workspace-access-keys-page" gap="2.5rem">
      <WorkspaceHeader workspace={workspace} />
      <Stack gap="3.25rem">
        <AccessKeySection workspace={workspace} />
        <TitleSection
          label={t`Access key log`}
          description={t`Recent access key usage from public endpoints, newest first.`}
        >
          <AccessKeyLogTable logs={logs} />
        </TitleSection>
      </Stack>
    </PageContainer>
  );
}
