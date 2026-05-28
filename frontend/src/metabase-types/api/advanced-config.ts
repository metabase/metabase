import type { WorkspaceInstanceDatabase } from "./workspace-instance";

export type AdvancedConfigDatabase = {
  name: string;
  engine: string;
  details: Record<string, unknown>;
};

export type AdvancedConfigWorkspace = {
  name: string;
  databases: Record<string, WorkspaceInstanceDatabase>;
};

export type AdvancedConfigContent = {
  databases?: AdvancedConfigDatabase[];
  workspace?: AdvancedConfigWorkspace;
};

export type AdvancedConfig = {
  version: number;
  config: AdvancedConfigContent;
};

export type ApplyAdvancedConfigRequest = {
  config: File;
};
