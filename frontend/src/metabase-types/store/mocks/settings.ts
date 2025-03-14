import type { EnterpriseSettings } from "metabase-enterprise/settings/types";
import type { Settings } from "metabase-types/api";
import { createMockSettings } from "metabase-types/api/mocks";

export const createMockSettingsState = (
  opts?: Partial<Settings> | Partial<EnterpriseSettings>,
) => ({
  // compatibility for moving settings to RTK store
  "getSessionProperties(undefined)": {
    status: "fulfilled",
    endpointName: "getSessionProperties",
    data: createMockSettings(opts ?? {}),
  },
});
