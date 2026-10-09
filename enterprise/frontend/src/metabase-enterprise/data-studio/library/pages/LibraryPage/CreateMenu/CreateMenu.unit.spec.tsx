import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state/state";
import { renderWithProviders, screen } from "__support__/ui";
import {
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import type { User } from "metabase-types/api/user";

import { CreateMenu } from ".";

interface SetupOptions {
  user?: Partial<User>;
  dataCollectionId?: number;
  canWriteToDataCollection?: boolean;
  canWriteToMetricCollection?: boolean;
  canWriteToDashboardCollection?: boolean;
}

const fullPermissionsUser: Partial<User> = {
  is_superuser: true,
  permissions: {
    can_create_queries: true,
    can_create_native_queries: true,
  },
};

const setup = ({
  user,
  dataCollectionId = 2,
  canWriteToDataCollection = true,
  canWriteToMetricCollection = true,
  canWriteToDashboardCollection = false,
}: SetupOptions = {}) => {
  const onNewDashboardClick = jest.fn();
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    }),
    currentUser: createMockUser(user),
  });
  setupEnterprisePlugins();
  const utils = renderWithProviders(
    <CreateMenu
      metricCollectionId={1}
      dataCollectionId={dataCollectionId}
      canWriteToDataCollection={canWriteToDataCollection}
      canWriteToMetricCollection={canWriteToMetricCollection}
      dashboardCollectionId={3}
      canWriteToDashboardCollection={canWriteToDashboardCollection}
      onNewDashboardClick={onNewDashboardClick}
    />,
    {
      storeInitialState: state,
    },
  );

  return { ...utils, onNewDashboardClick };
};

describe("CreateMenu", () => {
  it("renders all options for admins", async () => {
    setup({ user: fullPermissionsUser });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Metric", "Collection"]);
  });

  it("renders publish and collection options for data analysts", async () => {
    setup({ user: { is_data_analyst: true } });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Collection"]);
  });

  it("renders publish and metric options if user only has query builder access", async () => {
    setup({ user: { permissions: { can_create_queries: true } } });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Metric", "Collection"]);
  });

  it("does not render Metric option when canWriteToMetricCollection is false", async () => {
    setup({
      user: {
        is_superuser: true,
        permissions: {
          can_create_queries: true,
          can_create_native_queries: true,
        },
      },
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Collection"]);
  });

  it("renders Collection option when only Data collection is writable", async () => {
    setup({
      user: { is_data_analyst: true },
      canWriteToDataCollection: true,
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Collection"]);
  });

  it("does not render Collection option without writable Library collections", async () => {
    setup({
      user: {},
      canWriteToDataCollection: false,
      canWriteToMetricCollection: false,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));

    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table"]);
  });

  it("opens the collection modal with Library picker options", async () => {
    const { store } = setup({
      user: fullPermissionsUser,
      dataCollectionId: 42,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Collection/ }));

    expect(store.getState().modal).toEqual({
      id: "collection",
      props: {
        initialCollectionId: 42,
        namespaces: [null],
        pickerOptions: {
          hasLibrary: true,
          hasRootCollection: false,
          hasPersonalCollections: false,
          hasRecents: false,
          hasSearch: false,
          hasConfirmButtons: true,
          canCreateCollections: false,
        },
        showAuthorityLevelPicker: false,
      },
    });
  });

  it("renders the Dashboard option when the Dashboards collection is writable", async () => {
    const { onNewDashboardClick } = setup({
      user: fullPermissionsUser,
      canWriteToDashboardCollection: true,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    expect(
      screen.getAllByRole("menuitem").map((item) => item.textContent),
    ).toEqual(["Published table", "Metric", "Dashboard", "Collection"]);

    await userEvent.click(screen.getByRole("menuitem", { name: /Dashboard/ }));
    expect(onNewDashboardClick).toHaveBeenCalled();
  });

  it("renders the Collection option when only the Dashboards collection is writable", async () => {
    const { store } = setup({
      user: {},
      canWriteToDataCollection: false,
      canWriteToMetricCollection: false,
      canWriteToDashboardCollection: true,
    });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    await userEvent.click(screen.getByRole("menuitem", { name: /Collection/ }));

    expect(store.getState().modal.props).toMatchObject({
      initialCollectionId: 3,
      namespaces: [null],
    });
  });
});
