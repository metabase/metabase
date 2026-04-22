import { t } from "ttag";

import { ForwardRefLink } from "metabase/common/components/Link";
import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";
import { Button, Flex, Icon, Stack } from "metabase/ui";
import * as Urls from "metabase/utils/urls";
import { useListWorkspacesQuery } from "metabase-enterprise/api";

import { WorkspaceList } from "../../components/WorkspaceList";

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
      <Stack style={{ overflow: "hidden" }}>
        <Flex justify="flex-end">
          <Button
            leftSection={<Icon name="add" />}
            component={ForwardRefLink}
            to={Urls.newWorkspace()}
          >{t`New`}</Button>
        </Flex>
        <Flex direction="column" flex={1} mih={0}>
          <WorkspaceList workspaces={workspaces} isLoading={isLoading} />
        </Flex>
      </Stack>
    </PageContainer>
  );
}
