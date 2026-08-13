export interface SlackSettings {
  "slack-app-token": string | null;
  "slack-bug-report-channel": string | null;
}

export interface SlackAppInfo {
  app_id: string | null;
  team_id: string | null;
  scopes: {
    actual: string[];
    required: string[];
    missing: string[];
    extra: string[];
  } | null;
}
