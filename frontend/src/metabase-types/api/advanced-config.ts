export type AdvancedConfigDatabase = {
  name: string;
  engine: string;
  details: Record<string, unknown>;
};

export type AdvancedConfigContent = {
  databases?: AdvancedConfigDatabase[];
};

export type AdvancedConfig = {
  version: number;
  config: AdvancedConfigContent;
};

export type ApplyAdvancedConfigRequest = {
  config: File;
};
