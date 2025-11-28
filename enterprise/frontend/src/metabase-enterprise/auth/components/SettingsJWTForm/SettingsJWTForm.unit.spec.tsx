import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
  setupUpdateSettingsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { createMockGroup, createMockSettings } from "metabase-types/api/mocks";

import { type JWTFormValues, SettingsJWTForm } from "./SettingsJWTForm";

const GROUPS = [
  createMockGroup(),
  createMockGroup({ id: 2, name: "Administrators" }),
  createMockGroup({ id: 3, name: "foo" }),
  createMockGroup({ id: 4, name: "bar" }),
  createMockGroup({ id: 5, name: "flamingos" }),
];

const setup = async (
  settingValues?: Partial<JWTFormValues> & {
    "jwt-enabled"?: boolean;
    "use-tenants"?: boolean;
  },
) => {
  const settings = createMockSettings(settingValues);
  setupSettingsEndpoints([]);
  setupPropertiesEndpoints(settings);
  setupUpdateSettingsEndpoint();

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
    "jwt-attribute-tenant": null,
    "jwt-enabled": true,
    "jwt-group-sync": true,
  };

  it("should submit the correct payload", async () => {
    await setup();

    await userEvent.type(
      await screen.findByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", {
        name: /String used by the JWT signing key/,
      }),
      ATTRS["jwt-shared-secret"],
    );
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

  it("should not show tenant attribute unless tenanting is on", async () => {
    await setup();

    expect(
      screen.queryByText(/Tenant assignment attribute/),
    ).not.toBeInTheDocument();
  });

  it("should show tenant attribute when tenanting is on", async () => {
    await setup({ "use-tenants": true });

    await userEvent.type(
      await screen.findByRole("textbox", { name: /JWT Identity Provider URI/ }),
      ATTRS["jwt-identity-provider-uri"],
    );
    await userEvent.type(
      await screen.findByRole("textbox", {
        name: /String used by the JWT signing key/,
      }),
      ATTRS["jwt-shared-secret"],
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
    await setup({ "jwt-enabled": false });

    const saveButton = await screen.findByRole("button", {
      name: "Save and enable",
    });
    expect(saveButton).toBeDisabled();

    expect(screen.queryByText(/user provisioning/i)).not.toBeInTheDocument();
  });

  it("User provisioning should appear if JWT has been enabled", async () => {
    await setup({ "jwt-enabled": true });

    const saveButton = await screen.findByRole("button", {
      name: "Save changes",
    });
    expect(saveButton).toBeDisabled();

    expect(screen.getByText(/user provisioning/i)).toBeInTheDocument();
  });
});
