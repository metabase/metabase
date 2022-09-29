import { t } from "ttag";
import { SlackSettings } from "metabase-types/api";
import { FormObject } from "metabase-types/forms";

export const getSlackForm = (
  readOnly?: boolean,
): FormObject<SlackSettings> => ({
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
      title: t`Public channel to store image files`,
      placeholder: "metabase_files",
      readOnly,
      validate: (value: string) => !value && t`required`,
      normalize: (value: string) => value.toLowerCase(),
    },
  ],
});
