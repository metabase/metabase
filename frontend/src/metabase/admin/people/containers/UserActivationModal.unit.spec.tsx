import userEvent from "@testing-library/user-event";

import {
  findRequests,
  setupGroupsEndpoint,
  setupPermissionMembershipEndpoint,
  setupUserCollectionEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { Route, redirect } from "metabase/router";
import type { User } from "metabase-types/api";
import { createMockGroup, createMockUser } from "metabase-types/api/mocks";

import { PeopleListingApp } from "./PeopleListingApp";
import { UserActivationModal } from "./UserActivationModal";

const ADMIN = createMockUser({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
  email: "bobby@metabase.test",
  is_superuser: true,
});

const OTHER_ADMIN = createMockUser({
  id: 2,
  first_name: "Other",
  last_name: "Admin",
  email: "other@metabase.test",
  is_superuser: true,
});

interface SetupOpts {
  users: User[];
  initialRoute: string;
}

const setup = ({ users, initialRoute }: SetupOpts) => {
  setupUserCollectionEndpoints(users);
  setupGroupsEndpoint([
    createMockGroup({ id: 1, magic_group_type: "all-internal-users" }),
  ]);
  setupPermissionMembershipEndpoint({});

  return renderWithProviders(
    <Route path="/admin/people" element={<PeopleListingApp />}>
      <Route path=":userId">
        <Route index element={redirect("/admin/people")} />
        {modalRoute("deactivate", UserActivationModal, { noWrap: true })}
        {modalRoute("reactivate", UserActivationModal, { noWrap: true })}
      </Route>
    </Route>,
    {
      initialRoute,
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: ADMIN,
        settings: mockSettings(),
      }),
    },
  );
};

describe("UserActivationModal", () => {
  it("should deactivate a user and drop them from the list", async () => {
    const { router } = setup({
      users: [ADMIN, OTHER_ADMIN],
      initialRoute: "/admin/people/2/deactivate",
    });

    expect(
      await screen.findByText("Deactivate Other Admin?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Other Admin won't be able to log in anymore."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Deactivate" }));

    await waitFor(async () =>
      expect(await findRequests("DELETE")).toHaveLength(1),
    );
    const [{ url }] = await findRequests("DELETE");
    expect(url).toContain("/api/user/2");

    await waitFor(() =>
      expect(screen.queryByText("Other Admin")).not.toBeInTheDocument(),
    );
    expect(router?.location.pathname).toBe("/admin/people");
  });

  it("should reactivate a deactivated user", async () => {
    const { router } = setup({
      users: [ADMIN, { ...OTHER_ADMIN, is_active: false }],
      initialRoute: "/admin/people/2/reactivate",
    });

    expect(
      await screen.findByText("Reactivate Other Admin?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "They'll be able to log in again, and they'll be placed back into the groups they were in before their account was deactivated.",
      ),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Reactivate" }));

    await waitFor(async () =>
      expect((await findRequests("PUT")).map(({ url }) => url)).toContainEqual(
        expect.stringContaining("/api/user/2/reactivate"),
      ),
    );
    expect(await screen.findByText("Other Admin")).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/admin/people");
  });
});
