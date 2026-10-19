import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { createMockSettingsState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { UndoListing } from "metabase/common/components/UndoListing";
import {
  createMockDataApp,
  createMockTokenFeatures,
} from "metabase-types/api/mocks";

import { DataAppActionsMenu } from "./DataAppActionsMenu";

const setup = ({
  enabled = true,
  hasTenantsFeature = false,
  isTenantsEnabled = false,
  canRemove = false,
  resourceCollectionId = 9,
}: {
  enabled?: boolean;
  hasTenantsFeature?: boolean;
  isTenantsEnabled?: boolean;
  canRemove?: boolean;
  resourceCollectionId?: number;
} = {}) => {
  const app = createMockDataApp({
    name: "sales",
    display_name: "Sales",
    enabled,
    resource_collection_id: resourceCollectionId,
  });
  renderWithProviders(
    <>
      <DataAppActionsMenu app={app} canRemove={canRemove} />
      {/* Mounts the toaster so failure toasts are assertable in the DOM. */}
      <UndoListing />
    </>,
    {
      withRouter: true,
      storeInitialState: {
        settings: createMockSettingsState({
          "token-features": createMockTokenFeatures({
            tenants: hasTenantsFeature,
          }),
          "use-tenants": isTenantsEnabled,
        }),
      },
    },
  );
};

const openMenu = () =>
  userEvent.click(screen.getByRole("button", { name: "Actions for Sales" }));

const confirmRemove = async () =>
  userEvent.click(
    within(await screen.findByRole("dialog")).getByRole("button", {
      name: "Remove",
    }),
  );

describe("DataAppActionsMenu", () => {
  it("links to the app's resources and group above the enable action", async () => {
    setup();

    await openMenu();

    const menuItems = await screen.findAllByRole("menuitem");
    expect(menuItems).toHaveLength(3);

    const [viewResource, manageAccess, disable] = menuItems;

    expect(viewResource).toHaveTextContent("View resources");
    expect(viewResource).toHaveAttribute("href", "/collection/9");

    expect(manageAccess).toHaveTextContent("Manage group access");
    expect(manageAccess).toHaveAttribute(
      "href",
      "/admin/settings/apps/sales/groups",
    );

    expect(disable).toHaveTextContent("Disable");
  });

  it("should show a toast when toggling enabled fails", async () => {
    fetchMock.put("path:/api/apps/sales", 500);
    setup({ enabled: true });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Disable" }),
    );

    expect(
      await screen.findByText("Failed to update this app"),
    ).toBeInTheDocument();
  });

  it("should show a toast when removal fails", async () => {
    fetchMock.delete("path:/api/apps/sales", 500);
    setup({ canRemove: true });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    await confirmRemove();

    expect(
      await screen.findByText("Failed to remove this data app"),
    ).toBeInTheDocument();
  });

  it("should show a loading state on the trigger while a delete is in flight", async () => {
    let finishDelete = () => {};
    fetchMock.delete(
      "path:/api/apps/sales",
      () =>
        new Promise(
          (resolve) => (finishDelete = () => resolve({ status: 204 })),
        ),
    );
    setup({ canRemove: true });

    await openMenu();
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Remove" }),
    );
    await confirmRemove();

    const trigger = () =>
      screen.getByRole("button", { name: "Actions for Sales" });

    // Mantine marks a loading ActionIcon with `data-loading`.
    await waitFor(() =>
      expect(trigger()).toHaveAttribute("data-loading", "true"),
    );

    finishDelete();
    await waitFor(() =>
      expect(trigger()).not.toHaveAttribute("data-loading", "true"),
    );
  });
});

it("shows tenant access when tenants and the feature token are enabled", async () => {
  setup({ hasTenantsFeature: true, isTenantsEnabled: true });

  await openMenu();

  expect(
    screen.getByRole("menuitem", { name: "Manage tenant access" }),
  ).toHaveAttribute("href", "/admin/settings/apps/sales/tenant-groups");
  expect(
    screen.getByRole("menuitem", { name: "Manage group access" }),
  ).toHaveAttribute("href", "/admin/settings/apps/sales/groups");
});

it.each([
  { hasTenantsFeature: true, isTenantsEnabled: false },
  { hasTenantsFeature: false, isTenantsEnabled: true },
  { hasTenantsFeature: false, isTenantsEnabled: false },
])(
  "hides tenant access with token=$hasTenantsFeature and tenants=$isTenantsEnabled",
  async (options) => {
    setup(options);

    await openMenu();

    expect(
      screen.queryByRole("menuitem", { name: "Manage tenant access" }),
    ).not.toBeInTheDocument();
  },
);
