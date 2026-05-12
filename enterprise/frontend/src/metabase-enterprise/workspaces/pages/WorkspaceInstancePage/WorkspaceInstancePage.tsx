import { t } from "ttag";

import { DataStudioBreadcrumbs } from "metabase/data-studio/common/components/DataStudioBreadcrumbs";
import { PageContainer } from "metabase/data-studio/common/components/PageContainer";
import { PaneHeader } from "metabase/data-studio/common/components/PaneHeader";

import { WorkspaceHelpMenu } from "../../components/WorkspaceHelpMenu";

export function WorkspaceInstancePage() {
  return (
    <PageContainer data-testid="workspace-instance">
      <PaneHeader
        breadcrumbs={
          <DataStudioBreadcrumbs>{t`Workspace`}</DataStudioBreadcrumbs>
        }
        actions={<WorkspaceHelpMenu />}
        py={0}
      />
    </PageContainer>
  );
}
