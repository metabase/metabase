import fetchMock from "fetch-mock";

import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderRoutes, screen, waitFor } from "__support__/ui";
import { createMockGroup, createMockUser } from "metabase-types/api/mocks";

import { GroupDetailApp } from "./GroupDetailApp";

const GROUP_ID = 5;

const setup = () => {
  const currentUser = createMockUser({ id: 1, is_superuser: true });
  let resolveMemberships: () => void = () => undefined;
  const membershipsLoaded = new Promise<void>((resolve) => {
    resolveMemberships = resolve;
  });

  fetchMock.get(`path:/api/permissions/group/${GROUP_ID}`, {
    ...createMockGroup({ id: GROUP_ID, name: "Data Analysts" }),
    members: [],
  });
  fetchMock.get("path:/api/permissions/membership", async () => {
    await membershipsLoaded;
    return {};
  });

  renderRoutes(
    [
      {
        path: "/admin/people/groups/:groupId",
        element: <GroupDetailApp />,
      },
    ],
    {
      initialRoute: `/admin/people/groups/${GROUP_ID}`,
      storeInitialState: createMockState({
        settings: mockSettings(),
        currentUser,
      }),
    },
  );

  return { resolveMemberships };
};

describe("GroupDetailApp", () => {
  it("does not render group members until memberships have loaded", async () => {
    const { resolveMemberships } = setup();

    await waitFor(() =>
      expect(
        fetchMock.callHistory.called(`path:/api/permissions/group/${GROUP_ID}`),
      ).toBe(true),
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    try {
      expect(
        screen.queryByText("Add members to get started."),
      ).not.toBeInTheDocument();
    } finally {
      resolveMemberships();
    }

    expect(
      await screen.findByText("Add members to get started."),
    ).toBeInTheDocument();
  });
});
