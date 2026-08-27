import { PLUGIN_DATA_PERMISSIONS, reinitialize } from "metabase/plugins";
import { createMockState } from "metabase/redux/store/mocks";
import { hasPremiumFeature } from "metabase-enterprise/settings";
import type { GroupTableAccessPolicy } from "metabase-types/api";

import { initializePlugin } from "./index";

jest.mock("metabase-enterprise/settings", () => ({
  hasPremiumFeature: jest.fn(),
}));

// jest.mock above replaces the real implementation with a mock
const mockHasPremiumFeature = hasPremiumFeature as jest.MockedFunction<
  typeof hasPremiumFeature
>;

const createPolicy = (
  groupId: number,
  tableId: number,
): GroupTableAccessPolicy => ({
  id: tableId,
  group_id: groupId,
  table_id: tableId,
  card_id: null,
  attribute_remappings: {},
  permission_id: null,
});

const createSandboxesState = (policies: GroupTableAccessPolicy[]) => ({
  ...createMockState(),
  plugins: {
    shared: { attributes: null },
    sandboxingPlugin: {
      groupTableAccessPolicies: Object.fromEntries(
        policies.map((policy) => [
          `${policy.group_id}:${policy.table_id}`,
          policy,
        ]),
      ),
    },
  },
});

describe("sandboxes initializePlugin", () => {
  beforeAll(() => {
    mockHasPremiumFeature.mockImplementation(
      (feature) => feature === "sandboxes",
    );
    initializePlugin();
  });

  afterAll(() => {
    reinitialize();
  });

  it("reports draft policies and their group ids as strings in the permissions save payload", () => {
    const [selector] = PLUGIN_DATA_PERMISSIONS.permissionsPayloadExtraSelectors;
    const policies = [
      createPolicy(2, 5),
      createPolicy(2, 6),
      createPolicy(3, 7),
    ];

    const [extraData, modifiedGroupIds] = selector(
      createSandboxesState(policies),
    );

    expect(extraData).toEqual({ sandboxes: policies });
    // string ids are required to match the save payload's string-keyed
    // modified-group bookkeeping in getModifiedGroupsPermissionsGraphParts
    expect(modifiedGroupIds).toEqual(["2", "3"]);
  });

  it("reports policy drafts as pending changes", () => {
    const [hasChanges] = PLUGIN_DATA_PERMISSIONS.hasChanges;

    expect(hasChanges(createSandboxesState([createPolicy(2, 5)]))).toBe(true);
    expect(hasChanges(createSandboxesState([]))).toBe(false);
  });
});
