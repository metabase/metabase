import type { WorkspaceDatabaseInfo, WorkspaceInfo } from "../types";

export type DatabaseListSectionProps = {
  workspace: WorkspaceInfo;
  onChangeDatabases: (databases: WorkspaceDatabaseInfo[]) => void;
};

export function DatabaseListSection(_props: DatabaseListSectionProps) {
  return null;
}
