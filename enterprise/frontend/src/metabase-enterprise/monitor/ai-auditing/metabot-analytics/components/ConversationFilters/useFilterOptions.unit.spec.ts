import fetchMock from "fetch-mock";

import {
  setupGroupsEndpoint,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderHookWithProviders, waitFor } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { Group } from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { useFilterOptions } from "./useFilterOptions";

const setup = ({
  tenantsEnabled,
  groups,
}: {
  tenantsEnabled: boolean;
  groups: Partial<Group>[];
}) => {
  setupUsersEndpoints([]);
  setupGroupsEndpoint(groups.map(createMockGroup));
  fetchMock.get("path:/api/ee/tenant", { data: [] });

  return renderHookWithProviders(
    () =>
      useFilterOptions({ date: null, user: null, group: null, tenant: null }),
    {
      storeInitialState: createMockState({
        settings: mockSettings({
          "use-tenants": tenantsEnabled,
          "token-features": createMockTokenFeatures({
            tenants: tenantsEnabled,
          }),
        }),
      }),
    },
  );
};

describe("useFilterOptions", () => {
  it("shows All groups, All internal/external users when tenants enabled", async () => {
    const { result } = setup({
      tenantsEnabled: true,
      groups: [
        {
          id: 1,
          name: "All internal users",
          magic_group_type: "all-internal-users",
        },
        {
          id: 4,
          name: "All external users",
          magic_group_type: "all-external-users",
        },
      ],
    });

    await waitFor(() => {
      const labels = result.current.groupOptions.map((o) => o.label);
      expect(labels).toEqual(
        expect.arrayContaining([
          "All groups",
          "All internal users",
          "All external users",
        ]),
      );
    });
  });

  it("renames All Users to All groups when tenants disabled", async () => {
    const { result } = setup({
      tenantsEnabled: false,
      groups: [
        { id: 1, name: "All Users", magic_group_type: "all-internal-users" },
        { id: 2, name: "Admins", magic_group_type: "admin" },
      ],
    });

    await waitFor(() => {
      expect(result.current.groupOptions.length).toBeGreaterThan(0);
    });

    const labels = result.current.groupOptions.map((o) => o.label);
    expect(labels).toContain("All groups");
    expect(labels).not.toContain("All Users");
  });
});
