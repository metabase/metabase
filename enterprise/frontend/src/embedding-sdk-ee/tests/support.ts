/**
 * Setup only the plugins that we need and use in the embedding react sdk
 */
export function setupEmbeddingSdkEnterprisePlugins() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- dynamic plugin loading
  require("metabase-enterprise/sdk-plugins");
}
