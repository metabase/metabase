import { t } from "ttag";

export const getSlackForm = () => ({
  fields: [
    {
      name: "token",
      type: "input",
      title: t`Slack Bot User OAuth Token`,
      placeholder: "xoxb-781236542736-2364535789652-GkwFDQoHqzXDVsC6GzqYUypD",
    },
    {
      name: "channel",
      type: "input",
      title: t`Slack Channel`,
      placeholder: "#metabase_files",
    },
  ],
});
