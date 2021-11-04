export const setupMetabaseCloud = () => {
  cy.intercept(
    {
      method: "GET",
      url: "/api/setting",
    },
    [
      {
        key: "is-hosted?",
        value: true,
        is_env_setting: false,
        env_name: "MB_IS_HOSTED",
        description: "Is the Metabase instance running in the cloud?",
        default: null,
      },
    ],
  ).as("getSettings");
};
