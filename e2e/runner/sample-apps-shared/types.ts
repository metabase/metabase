export type SampleAppName =
  | "metabase-nodejs-react-sdk-embedding-sample"
  | "metabase-nextjs-sdk-embedding-sample"
  | "shoppy";

export type EmbeddingSdkVersion = string | "local" | undefined;

export type SampleAppSetupConfig = {
  subAppName?: string;
  branch: string;
  env: Record<string, string | number>;
  additionalSetup?: (data: {
    installationPath: string;
    loggerPrefix: string;
  }) => void;
  startCommand: string[];
  beforeSetup?: (metadata: { appName: string; subAppName?: string }) => void;
};

export type SampleAppSetupConfigs<
  TSampleAppSetupConfig extends SampleAppSetupConfig = SampleAppSetupConfig,
> = Partial<Record<SampleAppName, TSampleAppSetupConfig[]>>;
