import userEvent from "@testing-library/user-event";

import {
  setupGroupsEndpoint,
  setupPermissionMembershipEndpoint,
  setupUserCollectionEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, within } from "__support__/ui";
import { modalRoute } from "metabase/common/components/ModalRoute";
import { Route } from "metabase/router";
import type { EnterpriseSettings, GroupInfo, User } from "metabase-types/api";
import {
  createMockGroup,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { NewUserModal } from "./NewUserModal";
import { PeopleListingApp } from "./PeopleListingApp";
import { UserSuccessModal } from "./UserSuccessModal";

const ALL_USERS = createMockGroup({
  id: 1,
  name: "All Users",
  magic_group_type: "all-internal-users",
});
const ADMINISTRATORS = createMockGroup({
  id: 2,
  name: "Administrators",
  magic_group_type: "admin",
});

const CURRENT_USER = createMockUser({
  id: 1,
  first_name: "Bobby",
  last_name: "Tables",
  email: "bobby@metabase.test",
  is_superuser: true,
});

interface SetupOpts {
  users?: User[];
  groups?: GroupInfo[];
  settings?: Partial<EnterpriseSettings>;
}

const setup = ({
  users = [CURRENT_USER],
  groups = [ALL_USERS, ADMINISTRATORS],
  settings = {},
}: SetupOpts = {}) => {
  const collection = setupUserCollectionEndpoints(users, {
    adminGroupId: ADMINISTRATORS.id,
  });
  setupGroupsEndpoint(groups);
  setupPermissionMembershipEndpoint(() => collection.memberships);

  renderWithProviders(
    <Route path="/admin/people" element={<PeopleListingApp />}>
      {modalRoute("new", NewUserModal, { noWrap: true })}
      <Route path=":userId">
        {modalRoute("success", UserSuccessModal, { noWrap: true })}
      </Route>
    </Route>,
    {
      initialRoute: "/admin/people/new",
      withRouter: true,
      storeInitialState: createMockState({
        currentUser: CURRENT_USER,
        settings: mockSettings({
          "email-configured?": true,
          ...settings,
        }),
      }),
    },
  );

  return { collection };
};

const fillIn = async (label: string | RegExp, value: string) => {
  await userEvent.type(await screen.findByLabelText(label), value);
};

const submitForm = async () => {
  await userEvent.click(await screen.findByRole("button", { name: "Create" }));
};

const getUserRow = async (text: string) => {
  const table = await screen.findByTestId("admin-people-list-table");
  await within(table).findByText(text);
  const row = within(table)
    .getAllByRole("row")
    .find((candidate) => within(candidate).queryByText(text));
  if (!row) {
    throw new Error(`No row for ${text}`);
  }
  return row;
};

describe("NewUserModal", () => {
  it("should create a user and list them once the success modal is dismissed", async () => {
    setup();
    await fillIn("First name", "Testy");
    await fillIn("Last name", "McTestface");
    await fillIn(/Email/, "testy@metabase.test");

    await submitForm();

    expect(
      await screen.findByText("Testy McTestface has been added"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await getUserRow("Testy McTestface")).toHaveTextContent(
      "testy@metabase.test",
    );
  });

  it("should create a user with no first or last name (metabase#22754)", async () => {
    setup();
    await fillIn(/Email/, "noname@metabase.test");

    await submitForm();

    expect(
      await screen.findByText("noname@metabase.test has been added"),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Done" }));

    expect(await getUserRow("noname@metabase.test")).toBeInTheDocument();
  });

  it("should refuse an email that only differs in case from an existing one (metabase#16350)", async () => {
    setup();
    await fillIn("First name", "BobbyNew");
    await fillIn("Last name", "TablesNew");
    await fillIn(/Email/, CURRENT_USER.email.toUpperCase());

    await submitForm();

    expect(
      await screen.findByText("Email address already in use."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("BobbyNew TablesNew has been added"),
    ).not.toBeInTheDocument();
  });

  it("should show the new user's admin role without a reload (metabase#60241)", async () => {
    setup();
    await fillIn("First name", "Testy");
    await fillIn("Last name", "McTestface");
    await fillIn(/Email/, "testy@metabase.test");

    await userEvent.click(screen.getByRole("combobox", { name: "Groups" }));
    await userEvent.click(
      await screen.findByRole("option", { name: "Administrators" }),
    );

    await submitForm();
    await userEvent.click(await screen.findByRole("button", { name: "Done" }));

    expect(await getUserRow("Testy McTestface")).toHaveTextContent("Admin");
  });

  describe("invite email", () => {
    it("should say the invite explains how to set a password when password login is enabled", async () => {
      setup({
        settings: {
          "google-auth-enabled": true,
          "enable-password-login": true,
        },
      });
      await fillIn(/Email/, "testy@metabase.test");

      await submitForm();

      expect(
        await screen.findByText(/with instructions to set their password\./),
      ).toBeInTheDocument();
      expect(
        within(screen.getByRole("dialog")).getByText("testy@metabase.test"),
      ).toBeInTheDocument();
    });

    it("should offer a password reset link when password login is disabled (metabase#23630)", async () => {
      setup({
        settings: {
          "google-auth-enabled": true,
          "enable-password-login": false,
          "token-features": createMockTokenFeatures({ sso_google: true }),
        },
      });
      await fillIn(/Email/, "testy@metabase.test");

      await submitForm();

      expect(
        await screen.findByText(
          /with instructions to log in\. If this user is unable to authenticate then you can/,
        ),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "reset their password." }),
      ).toHaveAttribute("href", "/admin/people/1000/reset");
    });

    it("should hand over a generated password when email is not configured", async () => {
      setup({ settings: { "email-configured?": false } });
      await fillIn(/Email/, "testy@metabase.test");

      await submitForm();

      expect(
        await screen.findByText(/make sure to tell them to log in using/),
      ).toBeInTheDocument();
      expect(
        screen.getByLabelText("Toggle password visibility"),
      ).toBeInTheDocument();
    });
  });
});
