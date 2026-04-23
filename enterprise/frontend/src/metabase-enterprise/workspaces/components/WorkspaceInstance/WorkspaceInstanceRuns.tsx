import type { Location } from "history";

import { RunListPage } from "metabase/transforms/pages/RunListPage";
import { Box } from "metabase/ui";
import { useGetCurrentWorkspaceQuery } from "metabase-enterprise/api";

import { WorkspaceInstanceHeader } from "./WorkspaceInstanceHeader";

type WorkspaceInstanceRunsProps = {
  location: Location;
};

export function WorkspaceInstanceRuns({ location }: WorkspaceInstanceRunsProps) {
  const { data: workspace } = useGetCurrentWorkspaceQuery();

  return (
    <RunListPage
      location={location}
      header={
        <Box pb="lg">
          <WorkspaceInstanceHeader workspaceName={workspace?.name} />
        </Box>
      }
    />
  );
}
