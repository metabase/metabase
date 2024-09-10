const HEADER_STYLE = "color: #509ee3; font-size: 16px; font-weight: bold;";
const TEXT_STYLE = "color: #333; font-size: 14px;";
const LINK_STYLE =
  "color: #509ee3; font-size: 14px; text-decoration: underline;";

// TODO: Remove this method. Move it to where it belongs.
export const presentApiKeyUsageWarning = (appName: string) => {
  console.warn(
    `%c${appName} Embedding SDK for React\n\n` +
      `%cWarning: You are using API keys. This is only supported for evaluation purposes, has limited feature coverage and will only work on localhost.\n` +
      `For regular use, please implement SSO:\n\n` +
      `%chttps://github.com/metabase/metabase/blob/master/enterprise/frontend/src/embedding-sdk/README.md#authenticate-users-from-your-back-end\n\n`,
    HEADER_STYLE,
    TEXT_STYLE,
    LINK_STYLE,
  );
};
