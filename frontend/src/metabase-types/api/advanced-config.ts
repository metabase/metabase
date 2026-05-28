import type { WorkspaceInstance } from "./workspace-instance";

export type AdvancedConfigDatabase = {
  name: string;
  engine: string;
  details: Record<string, unknown>;
};

export type AdvancedConfigSettings = {
  "instance-workspace"?: WorkspaceInstance;
  [key: string]: unknown;
};

export type AdvancedConfigContent = {
  databases?: AdvancedConfigDatabase[];
  settings?: AdvancedConfigSettings;
};

export type AdvancedConfig = {
  version: number;
  config: AdvancedConfigContent;
};

export type ApplyAdvancedConfigRequest = {
  config: File;
};
