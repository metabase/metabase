export type SampleAppName =
  | "metabase-nodejs-react-sdk-embedding-sample"
  | "metabase-nextjs-sdk-embedding-sample"
  | "shoppy";

export type EmbeddingSdkVersion = string | "local" | undefined;

export type SampleAppSetupConfig = {
  "docker-compose-path": string;
  branch: string;
  env: Record<string, string | number>;
};

export type SampleAppSetupConfigs<
  TSampleAppSetupConfig extends SampleAppSetupConfig = SampleAppSetupConfig,
> = Partial<Record<SampleAppName, TSampleAppSetupConfig>>;
