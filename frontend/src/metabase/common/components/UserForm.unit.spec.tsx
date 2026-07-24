import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { setupTenantEntpoints } from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import type { GroupId, GroupInfo, Tenant, User } from "metabase-types/api";
import {
  createMockGroup,
  createMockTenant,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";

import { UserForm } from "./UserForm";

const GROUPS = [
  createMockGroup({ id: 1, magic_group_type: "all-internal-users" }),
  createMockGroup({ id: 2, name: "Administrators", magic_group_type: "admin" }),
  createMockGroup({ id: 3, name: "foo", magic_group_type: null }),
  createMockGroup({ id: 4, name: "bar", magic_group_type: null }),
  createMockGroup({ id: 5, name: "flamingos", magic_group_type: null }),
];

const USER = createMockUser({
  first_name: "Bobby",
  last_name: "Tables",
  email: "bobby.tables@metabase.com",
  user_group_memberships: [
    { id: 1, is_group_manager: false },
    { id: 3, is_group_manager: false },
  ],
});

interface SetupOpts {
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  initialValues?: Partial<User>;
  external?: boolean;
  tenants?: Tenant[];
  hideNameFields?: boolean;
  hideAttributes?: boolean;
  tokenFeatures?: Parameters<typeof createMockTokenFeatures>[0];
  groups?: GroupInfo[];
  groupAccess?: {
    groupIds: GroupId[];
    sectionLabel: string;
    warningMessage: string;
  };
}

const setup = ({
  enterprisePlugins,
  initialValues = USER,
  external = false,
  // Unjustified type cast. FIXME
  tenants = [] as Tenant[],
  hideNameFields = false,
  hideAttributes = false,
  tokenFeatures = { sandboxes: true, tenants: true },
  groups = GROUPS,
  groupAccess,
}: SetupOpts = {}) => {
  const onSubmit = jest.fn();
  const onCancel = jest.fn();

  setupTenantEntpoints(tenants);

  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures(tokenFeatures),
    }),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
  }

  renderWithProviders(
    <UserForm
      onSubmit={onSubmit}
      onCancel={onCancel}
      initialValues={initialValues}
      external={external}
      hideNameFields={hideNameFields}
      hideAttributes={hideAttributes}
      groups={groups}
      groupAccess={groupAccess}
    />,
    {
      storeInitialState: state,
    },
  );

  return {
    onSubmit,
  };
};

describe("UserForm", () => {
  describe("OSS", () => {
    it("should show the required fields", async () => {
      setup();

      expect(screen.getByLabelText("First name")).toHaveValue("Bobby");
      expect(screen.getByLabelText("Last name")).toHaveValue("Tables");
      expect(screen.getByLabelText(/Email/)).toHaveValue(
        "bobby.tables@metabase.com",
      );
      // This isn't a proper form input, so we need to grab the label specifically,
      // And can ensure the proper default group is applied
      expect(await screen.findByText("Groups")).toBeInTheDocument();
      expect(
        within(await screen.findByRole("list")).getByText("foo"),
      ).toBeInTheDocument();

      expect(screen.queryByText("Attributes")).not.toBeInTheDocument();
    });

    it("should not show validation errors before fields are touched (UXW-3719)", async () => {
      setup({ initialValues: {} });

      expect(await screen.findByLabelText(/Email/)).toBeInTheDocument();
      expect(screen.queryByText(/required/i)).not.toBeInTheDocument();
    });

    it("should allow you to add groups", async () => {
      const { onSubmit } = setup();

      await userEvent.click(
        await screen.findByRole("combobox", { name: "Groups" }),
      );
      await userEvent.click(
        await screen.findByRole("option", { name: "Administrators" }),
      );
      await userEvent.click(await screen.findByRole("option", { name: "bar" }));

      expect(
        await screen.findByRole("button", { name: "Update" }),
      ).toBeEnabled();

      await userEvent.click(
        await screen.findByRole("button", { name: "Update" }),
      );

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...USER,
            user_group_memberships: [
              { id: 1, is_group_manager: false },
              { id: 3, is_group_manager: false },
              { id: 2, is_group_manager: false },
              { id: 4, is_group_manager: false },
            ],
          },
          expect.anything(),
        );
      });
    });

    it("should allow you to remove a non-default group", async () => {
      const { onSubmit } = setup();

      // foo (id 3) is the only removable selected group; All Users is locked.
      await userEvent.click(
        await screen.findByRole("button", { name: "Remove foo" }),
      );

      await userEvent.click(
        await screen.findByRole("button", { name: "Update" }),
      );

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...USER,
            user_group_memberships: [{ id: 1, is_group_manager: false }],
          },
          expect.anything(),
        );
      });
    });

    it("keeps the default group locked and non-removable", async () => {
      setup();

      // All Users renders as a pill...
      expect(
        within(await screen.findByRole("list")).getByText("All Users"),
      ).toBeInTheDocument();
      // ...but without a remove control, so only foo (non-default) is removable.
      expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(
        1,
      );
    });
  });

  describe("EE", () => {
    const eeUser = { ...USER, login_attributes: { team: "engineering" } };

    it("should show login attributes widget", async () => {
      setup({
        enterprisePlugins: ["sandboxes", "tenants"],
        initialValues: eeUser,
      });

      expect(await screen.findByText("Attributes")).toBeInTheDocument();
      expect(await screen.findByText("Add an attribute")).toBeInTheDocument();

      expect(await screen.findByDisplayValue("team")).toBeInTheDocument();
      expect(
        await screen.findByDisplayValue("engineering"),
      ).toBeInTheDocument();
    });

    it("should allow you to add a login attribute", async () => {
      const { onSubmit } = setup({
        enterprisePlugins: ["sandboxes", "tenants"],
        initialValues: eeUser,
      });

      await userEvent.click(await screen.findByText("Add an attribute"));

      await userEvent.type(
        (await screen.findAllByPlaceholderText("Key"))[1],
        "exp",
      );
      await userEvent.type(
        (await screen.findAllByPlaceholderText("Value"))[1],
        "1234",
      );

      await userEvent.click(
        await screen.findByRole("button", { name: "Update" }),
      );

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...eeUser,
            login_attributes: {
              team: "engineering",
              exp: "1234",
            },
          },
          expect.anything(),
        );
      });
    });

    it("should allow you to remove a login attribute", async () => {
      const { onSubmit } = setup({
        enterprisePlugins: ["sandboxes", "tenants"],
        initialValues: eeUser,
      });

      await userEvent.click(await screen.findByTestId("remove-mapping"));

      await userEvent.click(
        await screen.findByRole("button", { name: "Update" }),
      );

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...eeUser,
            login_attributes: {},
          },
          expect.anything(),
        );
      });
    });

    it("should should not change the order of the inputs when working with numbers (#35316)", async () => {
      setup({
        enterprisePlugins: ["sandboxes", "tenants"],
        initialValues: eeUser,
      });

      await userEvent.click(await screen.findByText("Add an attribute"));

      await userEvent.type(
        (await screen.findAllByPlaceholderText("Key"))[1],
        "1",
      );

      expect((await screen.findAllByPlaceholderText("Key"))[1]).toHaveValue(
        "1",
      );
    });

    it("should show errors messages and disable form submit when 2 login attributes have the same key (#30196)", async () => {
      setup({
        enterprisePlugins: ["sandboxes", "tenants"],
        initialValues: eeUser,
      });

      await userEvent.click(await screen.findByText("Add an attribute"));

      // We need a delay in typing into the form so that the error
      // state is handled appropriately. Formik clears errors when you call
      // setValue, so we need to ensure that no other setValue calls are in
      // flight before typing the letter can cause the error.
      await userEvent.type(
        (await screen.findAllByPlaceholderText("Key"))[1],
        "team",
        { delay: 100 },
      );

      expect(
        await screen.findAllByText("Attribute keys can't have the same name"),
      ).toHaveLength(2);

      await waitFor(async () =>
        expect(
          await screen.findByRole("button", { name: "Update" }),
        ).toBeDisabled(),
      );
    });
  });

  describe("Tenant users", () => {
    const TENANTS = [
      createMockTenant({ id: 1, name: "Acme Corp" }),
      createMockTenant({ id: 2, name: "TechStart Inc" }),
    ];

    it("should require tenant_id for tenant users", async () => {
      setup({
        enterprisePlugins: ["sandboxes", "tenants"],
        external: true,
        tenants: TENANTS,
        initialValues: {
          ...USER,
          tenant_id: null,
        },
      });

      // Wait for form to render
      await screen.findByLabelText(/Email/);

      // The submit button should be disabled initially because tenant_id is required but not set
      expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();
    });

    it("should allow you to submit when tenant_id is selected", async () => {
      const { onSubmit } = setup({
        enterprisePlugins: ["sandboxes", "tenants"],
        external: true,
        tenants: TENANTS,
        initialValues: {
          ...USER,
          tenant_id: null,
        },
      });

      // Wait for form to render
      await screen.findByLabelText(/Email/);

      // Initially disabled because tenant_id is required but not set
      expect(screen.getByRole("button", { name: "Update" })).toBeDisabled();

      // Select a tenant
      await userEvent.click(
        await screen.findByRole("textbox", { name: "Tenant" }),
      );
      await userEvent.click(await screen.findByText("Acme Corp"));

      // Now the button should be enabled because form is dirty and valid
      await waitFor(() => {
        expect(screen.getByRole("button", { name: "Update" })).toBeEnabled();
      });

      // Submit the form
      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      // Verify form was submitted with the selected tenant_id
      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          expect.objectContaining({
            ...USER,
            tenant_id: 1,
          }),
          expect.anything(),
        );
      });
    });
  });

  describe("trimmed variant (invite flow)", () => {
    it("hides the name fields when hideNameFields is set", async () => {
      setup({ hideNameFields: true });

      expect(await screen.findByLabelText(/Email/)).toBeInTheDocument();
      expect(screen.queryByLabelText("First name")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Last name")).not.toBeInTheDocument();
    });

    it("hides the Attributes field when hideAttributes is set", async () => {
      setup({
        enterprisePlugins: ["sandboxes", "tenants"],
        initialValues: { ...USER, login_attributes: { team: "engineering" } },
        hideAttributes: true,
      });

      expect(await screen.findByLabelText(/Email/)).toBeInTheDocument();
      expect(screen.queryByText("Attributes")).not.toBeInTheDocument();
    });

    it("scopes the picker to provided groups without fetching the full list", async () => {
      setup({
        initialValues: {},
        groups: [createMockGroup({ id: 7, name: "scoped" })],
      });

      await userEvent.click(
        await screen.findByRole("combobox", { name: "Groups" }),
      );

      expect(
        await screen.findByRole("option", { name: "scoped" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: "foo" }),
      ).not.toBeInTheDocument();
      expect(fetchMock.callHistory.called("path:/api/permissions/group")).toBe(
        false,
      );
    });
  });

  describe("item access marking (UXW-4533)", () => {
    const GROUP_ACCESS = {
      groupIds: [4], // bar
      sectionLabel: "Can view this dashboard",
      warningMessage: "None of the selected groups can view this dashboard.",
    };

    it("warns while no selected group grants access, and clears once one is added", async () => {
      // USER belongs to All Users (1) and foo (3); neither grants access.
      setup({ groupAccess: GROUP_ACCESS });

      expect(
        await screen.findByText(GROUP_ACCESS.warningMessage),
      ).toBeInTheDocument();

      await userEvent.click(
        await screen.findByRole("combobox", { name: "Groups" }),
      );
      await userEvent.click(await screen.findByRole("option", { name: "bar" }));

      expect(
        screen.queryByText(GROUP_ACCESS.warningMessage),
      ).not.toBeInTheDocument();
    });

    it("counts the Administrators group's implicit access", async () => {
      setup({
        groupAccess: { ...GROUP_ACCESS, groupIds: [] },
        initialValues: {
          ...USER,
          user_group_memberships: [
            { id: 1, is_group_manager: false },
            { id: 2, is_group_manager: false },
          ],
        },
      });

      expect(await screen.findByRole("list")).toBeInTheDocument();
      expect(
        screen.queryByText(GROUP_ACCESS.warningMessage),
      ).not.toBeInTheDocument();
    });
  });

  describe("group manager memberships (EE)", () => {
    const eeTokenFeatures = {
      sandboxes: true,
      tenants: true,
      advanced_permissions: true,
    };

    const managerUser = {
      ...USER,
      user_group_memberships: [
        { id: 1, is_group_manager: false },
        { id: 3, is_group_manager: true },
      ],
    };

    it("preserves a group's manager flag when another group is added", async () => {
      const { onSubmit } = setup({
        enterprisePlugins: ["group_managers"],
        tokenFeatures: eeTokenFeatures,
        initialValues: managerUser,
      });

      await userEvent.click(
        await screen.findByRole("combobox", { name: "Groups" }),
      );
      await userEvent.click(await screen.findByRole("option", { name: "bar" }));

      expect(
        await screen.findByRole("button", { name: "Update" }),
      ).toBeEnabled();
      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...USER,
            user_group_memberships: [
              { id: 1, is_group_manager: false },
              { id: 3, is_group_manager: true },
              { id: 4, is_group_manager: false },
            ],
          },
          expect.anything(),
        );
      });
    });

    it("promotes a member to manager via the dropdown toggle", async () => {
      const { onSubmit } = setup({
        enterprisePlugins: ["group_managers"],
        tokenFeatures: eeTokenFeatures,
      });

      await userEvent.click(
        await screen.findByRole("combobox", { name: "Groups" }),
      );
      // foo (id 3) is a selected regular group, so its dropdown row offers promotion.
      await userEvent.click(
        await screen.findByRole("button", { name: "Turn into Manager" }),
      );

      expect(
        await screen.findByRole("button", { name: "Update" }),
      ).toBeEnabled();
      await userEvent.click(screen.getByRole("button", { name: "Update" }));

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalledWith(
          {
            ...USER,
            user_group_memberships: [
              { id: 1, is_group_manager: false },
              { id: 3, is_group_manager: true },
            ],
          },
          expect.anything(),
        );
      });
    });
  });
});
