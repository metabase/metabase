import userEvent from "@testing-library/user-event";

import { setupEnterprisePlugins } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state/state";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { Route } from "metabase/router";
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
}

const fullPermissionsUser: Partial<User> = {
  is_superuser: true,
  permissions: {
    can_create_queries: true,
    can_create_native_queries: true,
  },
};

const METRIC_COLLECTION_ID = 7;

const setup = ({
  user,
  dataCollectionId = 2,
  canWriteToDataCollection = true,
  canWriteToMetricCollection = true,
}: SetupOptions = {}) => {
  const state = createMockState({
    settings: mockSettings({
      "token-features": createMockTokenFeatures({ library: true }),
    }),
    currentUser: createMockUser(user),
  });
  setupEnterprisePlugins();
  const utils = renderWithProviders(
    <>
      <Route
        path="/data-studio/library"
        element={
          <CreateMenu
            metricCollectionId={METRIC_COLLECTION_ID}
            dataCollectionId={dataCollectionId}
            canWriteToDataCollection={canWriteToDataCollection}
            canWriteToMetricCollection={canWriteToMetricCollection}
          />
        }
      />
      <Route
        path="/data-studio/library/metrics/new"
        element={<h1>New metric page</h1>}
      />
    </>,
    {
      storeInitialState: state,
      withRouter: true,
      initialRoute: "/data-studio/library",
    },
  );

  return utils;
};

describe("CreateMenu", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("tracks metric_create_started and opens the new metric page in the Metrics collection", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    const { router } = setup({ user: fullPermissionsUser });

    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    const metricItem = screen.getByRole("menuitem", { name: /Metric/ });
    expect(metricItem).toHaveAttribute(
      "href",
      `/data-studio/library/metrics/new?collectionId=${METRIC_COLLECTION_ID}`,
    );
    expect(trackSimpleEvent).not.toHaveBeenCalled();
    await userEvent.click(metricItem);

    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "metric_create_started",
      triggered_from: "data_studio_library",
    });
    expect(
      await screen.findByRole("heading", { name: "New metric page" }),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(router?.location.search).toBe(
        `?collectionId=${METRIC_COLLECTION_ID}`,
      );
    });
  });

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
});
