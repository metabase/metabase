import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupGenerateRandomTokenEndpoint,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { SettingDefinition } from "metabase-types/api";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import { SettingsJWTForm } from "./SettingsJWTForm";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators" }),
  createMockGroup({ id: 3, name: "foo" }),
  createMockGroup({ id: 4, name: "bar" }),
  createMockGroup({ id: 5, name: "flamingos" }),
];

const setup = async ({
  jwtEnabled,
  useTenants,
  settings = [],
}: {
  jwtEnabled?: boolean;
  useTenants?: boolean;
  settings?: SettingDefinition[];
} = {}) => {
  setupSettingsEndpoints([
    { key: "use-tenants", value: useTenants ?? false },
    { key: "jwt-enabled", value: jwtEnabled ?? false },
    ...settings,
  ]);
  setupPropertiesEndpoints(
    createMockSettings({
      "use-tenants": useTenants,
      "jwt-enabled": jwtEnabled,
    }),
  );
  setupUpdateSettingsEndpoint();
  setupGenerateRandomTokenEndpoint("1234abcd");

  fetchMock.get("path:/api/permissions/group", GROUPS);

  renderWithProviders(<SettingsJWTForm />);

  await screen.findByText("Server Settings");
};

describe("SettingsJWTForm", () => {
  const ATTRS = {
    "jwt-user-provisioning-enabled?": false,
    "jwt-identity-provider-uri": "http://example.com",
    "jwt-shared-secret":
      "590ab155f412d477b8ab9c8b0e7b2e3ab4d4523e83770a724a2088edbde7f19a",
    "jwt-attribute-email": "john@example.com",
    "jwt-attribute-firstname": "John",
    "jwt-attribute-lastname": "Doe",
    "jwt-attribute-groups": "grouper",
    "jwt-enabled": true,
    "jwt-group-sync": true,
  };

  it("should submit the correct payload", async () => {
    await setup();

    await userEvent.type(
      await screen.findByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );
    await userEvent.click(
      await screen.findByRole("button", { name: /Set up key/ }),
    );
    await userEvent.clear(await screen.findByLabelText(/New secret key/));
    await userEvent.type(
      await screen.findByLabelText(/New secret key/),
      ATTRS["jwt-shared-secret"],
    );
    await userEvent.click(await screen.findByRole("button", { name: /Done/ }));
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Email attribute/ }),
      ATTRS["jwt-attribute-email"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /First name attribute/ }),
      ATTRS["jwt-attribute-firstname"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Last name attribute/ }),
      ATTRS["jwt-attribute-lastname"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", {
        name: /Group assignment attribute/,
      }),
      ATTRS["jwt-attribute-groups"],
    );
    const groupSchema = await screen.findByTestId("jwt-group-schema");
    await userEvent.click(within(groupSchema).getByRole("switch")); // checkbox for "jwt-group-sync"

    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;
    // it's strange that there's no special JWT endpoint when other SSO methods have endpoints with fancy validation 🤷‍♀️
    expect(url).toMatch(/\/api\/setting$/);
    expect(body).toEqual(ATTRS);
  });

  it("should show an environment notice instead of the group sync switch (#82849)", async () => {
    await setup({
      settings: [
        {
          key: "jwt-group-sync",
          value: null,
          is_env_setting: true,
          env_name: "MB_JWT_GROUP_SYNC",
        },
      ],
    });

    const groupSync = within(await screen.findByTestId("jwt-group-schema"));
    expect(
      await groupSync.findByText("Using MB_JWT_GROUP_SYNC"),
    ).toBeInTheDocument();
    expect(groupSync.queryByRole("switch")).not.toBeInTheDocument();
    expect(await groupSync.findByText("No mappings yet")).toBeInTheDocument();

    await userEvent.type(
      screen.getByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );
    await userEvent.click(screen.getByRole("button", { name: /Save/ }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    expect(puts[0].body).toHaveProperty(
      "jwt-identity-provider-uri",
      ATTRS["jwt-identity-provider-uri"],
    );
    expect(puts[0].body).not.toHaveProperty("jwt-group-sync");
    expect(groupSync.queryByRole("switch")).not.toBeInTheDocument();
    expect(groupSync.getByText("Using MB_JWT_GROUP_SYNC")).toBeInTheDocument();
  });

  it.each([true, false])(
    "should keep non-environment group sync editable when set to %s (#82849)",
    async (value) => {
      await setup({ settings: [{ key: "jwt-group-sync", value }] });

      const groupSync = within(await screen.findByTestId("jwt-group-schema"));
      const toggle = await groupSync.findByRole("switch", { checked: value });
      expect(toggle).toBeEnabled();
      await userEvent.click(toggle);
      expect(groupSync.getByRole("switch", { checked: !value })).toBeEnabled();

      await userEvent.type(
        screen.getByRole("textbox", { name: /JWT Identity Provider URI/ }),
        ATTRS["jwt-identity-provider-uri"],
      );
      await userEvent.click(screen.getByRole("button", { name: /Save/ }));

      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
      expect(puts[0].body).toHaveProperty("jwt-group-sync", !value);
    },
  );

  it("should not show tenant attribute unless tenanting is on", async () => {
    await setup();

    expect(
      screen.queryByText(/Tenant assignment attribute/),
    ).not.toBeInTheDocument();
  });

  it("should show tenant attribute when tenanting is on", async () => {
    await setup({ useTenants: true });

    await userEvent.type(
      await screen.findByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );

    await userEvent.type(
      await screen.findByRole("textbox", {
        name: /Tenant assignment attribute/,
      }),
      "Cat",
    );

    await userEvent.click(await screen.findByRole("button", { name: /Save/ }));

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(1);
    const [{ url, body }] = puts;

    expect(url).toMatch(/\/api\/setting$/);
    expect(body).toHaveProperty("jwt-attribute-tenant", "Cat");
  });

  it("User provisioning should not appear if JWT has not been enabled", async () => {
    await setup({ jwtEnabled: false });

    const saveButton = await screen.findByRole("button", {
      name: "Save and enable",
    });
    expect(saveButton).toBeDisabled();

    expect(screen.queryByText(/user provisioning/i)).not.toBeInTheDocument();
  });

  it("User provisioning should appear if JWT has been enabled", async () => {
    await setup({ jwtEnabled: true });

    const saveButton = await screen.findByRole("button", {
      name: "Save changes",
    });
    expect(saveButton).toBeDisabled();

    expect(screen.getByText(/user provisioning/i)).toBeInTheDocument();
  });
});
