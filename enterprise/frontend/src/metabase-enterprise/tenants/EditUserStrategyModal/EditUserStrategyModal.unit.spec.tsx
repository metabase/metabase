import { within } from "@testing-library/react";
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
  onClose?: () => void;
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

  renderWithProviders(
    <EditUserStrategyModal onClose={options?.onClose ?? (() => {})} />,
    {
      storeInitialState: createMockState({
        settings: createMockSettingsState(settings),
      }),
    },
  );
};

describe("EditUserStrategyModal", () => {
  it("should handle loading state", async () => {
    await setup();
    expect(screen.getByText("Loading...")).toBeInTheDocument();
    await screen.findByText("Pick a user strategy");
  });

  it("should correctly select single-tenancy if use-tenants setting is false", async () => {
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

    const multiTenantCard = await screen.findByRole("radio", {
      name: /Multi tenant/,
      checked: false,
    });
    expect(multiTenantCard).toBeInTheDocument();
    await userEvent.click(multiTenantCard);

    expect(
      screen.getByRole("radio", { name: /Multi tenant/, checked: true }),
    ).toBeInTheDocument();

    const applyButton = screen.getByRole("button", { name: /Apply/ });
    await userEvent.click(applyButton);

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    expect(puts[0].body).toEqual({ value: true });
  });

  it("asks for confirmation before disabling and only sends after confirm", async () => {
    await setup({ useTenants: true });

    await userEvent.click(
      await screen.findByRole("radio", {
        name: /Single tenant/,
        checked: false,
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Apply/ }));

    const confirmModal = await screen.findByTestId("confirm-modal");
    expect(
      within(confirmModal).getByText(/Disable tenants\?/i),
    ).toBeInTheDocument();

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(0);
    });

    await userEvent.click(
      within(confirmModal).getByRole("button", {
        name: /Proceed and disable/i,
      }),
    );

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(1);
    });

    const puts = await findRequests("PUT");
    expect(puts[0].body).toEqual({ value: false });
  });

  it("closes confirmation without sending when disabling is cancelled", async () => {
    await setup({ useTenants: true });

    await userEvent.click(
      await screen.findByRole("radio", {
        name: /Single tenant/,
        checked: false,
      }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Apply/ }));

    const confirmModal = await screen.findByTestId("confirm-modal");
    await userEvent.click(
      within(confirmModal).getByRole("button", { name: /Cancel/i }),
    );

    await waitFor(async () => {
      const puts = await findRequests("PUT");
      expect(puts).toHaveLength(0);
    });

    expect(
      screen.getByRole("radio", { name: /Single tenant/, checked: true }),
    ).toBeInTheDocument();
  });

  it("reverts the selected user strategy if the setting update fails", async () => {
    fetchMock.put("path:/api/setting/use-tenants", {
      throws: new Error("Internal server error"),
    });

    await setup();

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

    // Revert to single tenant as the API call failed
    expect(
      await screen.findByRole("radio", {
        name: /Single tenant/,
        checked: true,
      }),
    ).toBeInTheDocument();
  });

  it("should disable the apply button when the user strategy has not changed", async () => {
    await setup();

    expect(
      await screen.findByRole("radio", {
        name: /Single tenant/,
        checked: true,
      }),
    ).toBeInTheDocument();

    const applyButton = screen.getByRole("button", { name: /Apply/ });
    expect(applyButton).toBeDisabled();

    await userEvent.click(screen.getByRole("radio", { name: /Multi tenant/ }));
    expect(applyButton).toBeEnabled();

    await userEvent.click(screen.getByRole("radio", { name: /Single tenant/ }));
    expect(applyButton).toBeDisabled();
  });

  it("should clear selection when cancel button is clicked", async () => {
    const onClose = jest.fn();
    await setup({ onClose });

    expect(
      await screen.findByRole("radio", {
        name: /Single tenant/,
        checked: true,
      }),
    ).toBeInTheDocument();

    // Change selection to multi-tenant
    await userEvent.click(screen.getByRole("radio", { name: /Multi tenant/ }));

    expect(
      screen.getByRole("radio", { name: /Multi tenant/, checked: true }),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Cancel/ }));

    // selection should revert back to single tenant
    expect(
      screen.getByRole("radio", {
        name: /Single tenant/,
        checked: true,
      }),
    ).toBeInTheDocument();

    expect(onClose).toHaveBeenCalledTimes(1);

    const puts = await findRequests("PUT");
    expect(puts).toHaveLength(0);
  });
});
