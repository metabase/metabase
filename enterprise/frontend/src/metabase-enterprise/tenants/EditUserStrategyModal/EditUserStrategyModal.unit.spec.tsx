import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  findRequests,
  setupPropertiesEndpoints,
  setupSettingsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import {
  createMockSettingDefinition,
  createMockSettings,
} from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { EditUserStrategyModal } from "./EditUserStrategyModal";

interface SetupOpts {
  useTenants?: boolean;
  setupEndpoints?: () => void;
}

const setup = async (options?: SetupOpts) => {
  const useTenants = options?.useTenants ?? false;
  const settings = { "use-tenants": useTenants };
  const properties = createMockSettings(settings);

  fetchMock.put("path:/api/setting/use-tenants", 204);
  setupPropertiesEndpoints(properties);
  setupSettingsEndpoints([
    createMockSettingDefinition({ key: "use-tenants", value: useTenants }),
  ]);
  options?.setupEndpoints?.();

  renderWithProviders(<EditUserStrategyModal onClose={() => {}} />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState(settings),
    }),
  });
};

describe("EditUserStrategyModal", () => {
  it("should handle loading state", async () => {
    await setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await screen.findByText("User strategy");
  });

  it("should correctly display single-tenancy as selected if use-tenants setting is false", async () => {
    await setup();

    expect(
      await screen.findByRole("radio", {
        name: /Single tenant/,
        checked: true,
      }),
    ).toBeInTheDocument();
  });

  it("should correctly display multi-tenancy as selected if use-tenants setting is true", async () => {
    await setup({ useTenants: true });

    expect(
      await screen.findByRole("radio", {
        name: /Multi tenant/,
        checked: true,
      }),
    ).toBeInTheDocument();
  });

  it("should allow changing selection and applying the change", async () => {
    await setup();

    const singleTenantCard = await screen.findByRole("radio", {
      name: /Single tenant/,
      checked: true,
    });
    expect(singleTenantCard).toBeInTheDocument();

    const multiTenantCard = screen.getByRole("radio", {
      name: /Multi tenant/,
      checked: false,
    });
    expect(multiTenantCard).toBeInTheDocument();

    // Click the multi-tenant card
    await userEvent.click(multiTenantCard);

    // Verify the selection changed locally
    expect(
      screen.getByRole("radio", {
        name: /Multi tenant/,
        checked: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", {
        name: /Single tenant/,
        checked: false,
      }),
    ).toBeInTheDocument();

    setupPropertiesEndpoints(createMockSettings({ "use-tenants": true }));

    // Click the Apply button
    const applyButton = screen.getByRole("button", { name: /apply/i });
    await userEvent.click(applyButton);

    // Verify the API call was made
    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    expect(puts[0].body).toEqual({ value: true });
  });

  it("should disable Apply button when selection hasn't changed", async () => {
    await setup();

    await screen.findByRole("radio", { name: /Single tenant/ });

    const applyButton = screen.getByRole("button", { name: /Apply/ });
    expect(applyButton).toBeDisabled();
  });

  it("should enable Apply button when selection changes", async () => {
    await setup();

    const multiTenantCard = await screen.findByRole("radio", {
      name: /Multi tenant/,
    });

    await userEvent.click(multiTenantCard);

    const applyButton = screen.getByRole("button", { name: /Apply/ });
    expect(applyButton).toBeEnabled();
  });

  it("should handle failing to update", async () => {
    await setup({
      setupEndpoints: () => {
        fetchMock.put("path:/api/setting/use-tenants", 500, {
          overwriteRoutes: true,
        });
      },
    });

    expect(
      await screen.findByRole("radio", {
        name: /Single tenant/,
        checked: true,
      }),
    ).toBeInTheDocument();

    const multiTenantCard = screen.getByRole("radio", {
      name: /Multi tenant/,
    });
    await userEvent.click(multiTenantCard);

    const applyButton = screen.getByRole("button", { name: /Apply/ });
    await userEvent.click(applyButton);

    await waitFor(() => findRequests("PUT"));

    // Selection should remain as multi-tenant in the UI even though the API call failed
    expect(
      screen.getByRole("radio", {
        name: /Multi tenant/,
        checked: true,
      }),
    ).toBeInTheDocument();
  });
});
