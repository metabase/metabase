// BrowseMetrics reads PLUGIN_CONTENT_VERIFICATION when its module loads. The
// app lazy-loads the page after it initializes the plugins, so a spec must
// import this module before the module that imports BrowseMetrics.
import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockTokenFeatures } from "metabase-types/api/mocks";

mockSettings({
  "token-features": createMockTokenFeatures({ content_verification: true }),
});
setupEnterpriseOnlyPlugin("content_verification");
