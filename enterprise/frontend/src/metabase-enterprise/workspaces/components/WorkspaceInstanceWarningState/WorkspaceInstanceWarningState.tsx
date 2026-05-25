import { Link } from "react-router";
import { t } from "ttag";

import { Box, Button } from "metabase/ui";
import * as Urls from "metabase/urls";

import { WorkspaceEmptyState } from "../WorkspaceEmptyState";

export function WorkspaceInstanceWarningState() {
  return (
    <WorkspaceEmptyState
      description={t`You cannot manage workspaces when the current instance is in a workspace itself.`}
    >
      <Box pb="xl">
        <Button component={Link} to={Urls.workspaceInstance()} variant="filled">
          {t`Go to the current workspace`}
        </Button>
      </Box>
    </WorkspaceEmptyState>
  );
}
