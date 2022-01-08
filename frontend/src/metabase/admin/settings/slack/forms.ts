import { t } from "ttag";

export const getSlackForm = (readOnly?: boolean) => ({
  fields: [
    {
      name: "slack-app-token",
      type: "input",
      title: t`Slack Bot User OAuth Token`,
      placeholder: "xoxb-781236542736-2364535789652-GkwFDQoHqzXDVsC6GzqYUypD",
      readOnly,
      validate: (value: string) => !value && t`required`,
    },
    {
      name: "slack-files-channel",
      type: "input",
      title: t`Slack channel name`,
      placeholder: "metabase_files",
      readOnly,
      normalize: (value: string) => value.toLowerCase(),
      validate: (value: string) => !value && t`required`,
    },
  ],
});
