import { useState } from "react";
import { t } from "ttag";

import type { WorkspaceDatabase } from "metabase-types/api";

import type { WorkspaceInfo } from "../../types";
import { WorkspaceEditor } from "../WorkspacePage/WorkspaceEditor";

export function NewWorkspacePage() {
  const [workspace, setWorkspace] = useState<WorkspaceInfo>(
    getInitialWorkspace(),
  );

  const handleNameChange = (name: string) => {
    setWorkspace({ ...workspace, name });
  };

  const handleDatabasesChange = (databases: WorkspaceDatabase[]) => {
    setWorkspace({ ...workspace, databases });
  };

  return (
    <WorkspaceEditor
      workspace={workspace}
      onNameChange={handleNameChange}
      onDatabasesChange={handleDatabasesChange}
    />
  );
}

function getInitialWorkspace(): WorkspaceInfo {
  return {
    name: t`New workspace`,
    databases: [],
  };
}
