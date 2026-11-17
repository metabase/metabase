import fetchMock from "fetch-mock";

import type {
  SetupGuideChecklist,
  SetupGuideChecklistResponse,
} from "metabase/embedding/setup-guide/api/setup-guide";

export const createMockSetupGuideChecklist = (
  opts?: Partial<SetupGuideChecklist>,
): SetupGuideChecklist => ({
  "add-data": false,
  "configure-ai": false,
  "configure-row-column-security": false,
  "create-custom-theme": false,
  "create-dashboard": false,
  "create-tenants": false,
  "create-test-embed": false,
  "data-permissions-and-enable-tenants": false,
  "embed-production": false,
  "enable-tenants": false,
  "move-dashboard-to-shared": false,
  "setup-data-segregation-strategy": false,
  "sso-auth-manual-tested": false,
  "sso-configured": false,
  ...opts,
});

type ChecklistEndpointOpts = {
  checklist?: SetupGuideChecklist;
  strategy?: SetupGuideChecklistResponse["data-isolation-strategy"];
};

/** Pass a function to change the response between requests. */
export function setupSetupGuideChecklistEndpoint(
  opts: ChecklistEndpointOpts | (() => ChecklistEndpointOpts) = {},
) {
  fetchMock.get(
    "path:/api/embedding-hub/checklist",
    (): SetupGuideChecklistResponse => {
      const { checklist = createMockSetupGuideChecklist(), strategy = null } =
        typeof opts === "function" ? opts() : opts;

      return { checklist, "data-isolation-strategy": strategy };
    },
    { name: "setup-guide-checklist" },
  );
}
