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
    await screen.findByLabelText("User strategy");
  });

  it("should correctly set to single-tenancy if use-tenants setting is false", async () => {
    await setup();

    const select = await userStrategySelect();
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("Single tenant");
  });

  it("should correctly set to multi-tenancy if use-tenants setting is true", async () => {
    await setup({ useTenants: true });

    const select = await userStrategySelect();
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("Multi tenant");
  });

  it("should correctly update user strategy", async () => {
    await setup();

    const select1 = await userStrategySelect();
    expect(select1).toBeInTheDocument();
    expect(select1).toHaveValue("Single tenant");

    await userEvent.click(select1);
    setupPropertiesEndpoints(createMockSettings({ "use-tenants": true }));
    await userEvent.click(await screen.findByText("Multi tenant"));
    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const select2 = await userStrategySelect();
    expect(select2).toBeInTheDocument();
    expect(select2).toHaveValue("Multi tenant");
  });

  it("should handle failing to update", async () => {
    await setup({
      setupEndpoints: () => {
        fetchMock.put("path:/api/setting/use-tenants", 500, {
          overwriteRoutes: true,
        });
      },
    });

    const select1 = await userStrategySelect();
    expect(select1).toBeInTheDocument();
    expect(select1).toHaveValue("Single tenant");

    await userEvent.click(select1);
    await userEvent.click(await screen.findByText("Multi tenant"));
    await waitFor(() => findRequests("PUT"));

    const select2 = await userStrategySelect();
    expect(select2).toBeInTheDocument();
    expect(select2).toHaveValue("Single tenant");
  });
});

const userStrategySelect = () => screen.findByLabelText("User strategy");
