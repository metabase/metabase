import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupCollectionByIdEndpoint,
  setupDashboardCreateEndpoint,
} from "__support__/server-mocks";
import { screen, waitFor } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { useLocale } from "metabase/common/hooks/use-locale";
import { ROOT_COLLECTION as ROOT } from "metabase/entities/collections";
import type { Collection, Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockDashboard,
  createMockUser,
} from "metabase-types/api/mocks";

import {
  CreateDashboardModal,
  type CreateDashboardModalProps,
} from "./CreateDashboardModal";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

const useLocaleMock = useLocale as jest.Mock;

const CURRENT_USER = createMockUser({
  id: getNextId(),
  personal_collection_id: getNextId(),
  is_superuser: true,
});

const ROOT_COLLECTION = createMockCollection({
  ...ROOT,
  can_write: true,
});

const PERSONAL_COLLECTION = createMockCollection({
  id: CURRENT_USER.personal_collection_id,
  name: "Personal collection",
  can_write: true,
  is_personal: true,
  location: "/",
});

const COLLECTIONS = [ROOT_COLLECTION, PERSONAL_COLLECTION];

describe("CreateDashboardModal", () => {
  it("should render a loader when a locale is loading", async () => {
    setup({ isLocaleLoading: true });

    expect(screen.queryByText("New dashboard")).not.toBeInTheDocument();
  });

  it("should render", async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText("New dashboard")).toBeInTheDocument();
    });

    expect(screen.getByText("Description")).toBeInTheDocument();

    expect(
      screen.getByText("Which collection should this go in?"),
    ).toBeInTheDocument();
  });

  it("should create a new dashboard on form submit", async () => {
    const mockResponseDashboard = createMockDashboard({
      name: "My awesome dashboard title",
    });
    setupDashboardCreateEndpoint(mockResponseDashboard);

    const onCreate = jest.fn();

    setup({
      props: {
        onCreate,
      },
    });

    await waitFor(() => {
      expect(screen.getByText("New dashboard")).toBeInTheDocument();
    });

    await userEvent.type(
      screen.getByPlaceholderText("What is the name of your dashboard?"),
      "My awesome dashboard title",
    );

    await waitFor(() => {
      return expect(
        fetchMock.callHistory.called(
          `path:/api/collection/${PERSONAL_COLLECTION.id}`,
        ),
      ).toBe(true);
    });

    expect(screen.getByTestId("collection-picker-button")).toHaveTextContent(
      PERSONAL_COLLECTION.name,
    );

    await userEvent.click(screen.getByText("Create"));

    expect(
      fetchMock.callHistory.calls(`path:/api/dashboard`, { method: "POST" }),
    ).toHaveLength(1);

    // api called with typed form input
    const lastCall = fetchMock.callHistory.lastCall(`path:/api/dashboard`, {
      method: "POST",
    });
    expect(await lastCall?.request?.json()).toMatchObject({
      name: "My awesome dashboard title",
      collection_id: PERSONAL_COLLECTION.id,
    });

    // called prop with api response
    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate).toHaveBeenLastCalledWith(mockResponseDashboard);
  });

  it('should support "isOpen" prop', async () => {
    const { rerender } = setup({
      props: {
        isOpen: false,
      },
    });

    expect(screen.queryByText("New dashboard")).not.toBeInTheDocument();

    rerender(<CreateDashboardModal isOpen onCreate={jest.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("New dashboard")).toBeInTheDocument();
    });
  });

  it('should set the starting collection to the user\'s personal collection when not passing "initialCollectionId"', async () => {
    setup();

    await waitFor(() => {
      expect(screen.getByText("New dashboard")).toBeInTheDocument();
    });

    expect(screen.getByTestId("collection-picker-button")).toHaveTextContent(
      PERSONAL_COLLECTION.name,
    );
  });

  it('should set the starting collection from "initialCollectionId" prop', async () => {
    const anotherCollection = createMockCollection({
      id: getNextId(),
      name: "Another collection",
      can_write: true,
    });

    setup({
      props: {
        initialCollectionId: anotherCollection.id,
      },
      collections: [...COLLECTIONS, anotherCollection],
    });

    await waitFor(() => {
      expect(screen.getByText("New dashboard")).toBeInTheDocument();
    });

    expect(screen.getByTestId("collection-picker-button")).toHaveTextContent(
      anotherCollection.name,
    );
  });

  it('should hide the collection picker when passing "targetCollection"', async () => {
    const anotherCollection = createMockCollection({
      id: getNextId(),
      name: "Another collection",
      can_write: true,
    });

    const expectedDashboard = {
      name: "My awesome dashboard title",
    } satisfies Partial<Dashboard>;
    setupDashboardCreateEndpoint(expectedDashboard);

    setup({
      props: {
        // Should prioritize `targetCollection` over `initialCollectionId`
        initialCollectionId: PERSONAL_COLLECTION.id,
        targetCollection: anotherCollection.id,
      },
      collections: [...COLLECTIONS, anotherCollection],
    });

    await waitFor(() => {
      expect(screen.getByText("New dashboard")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("collection-picker-button"),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("What is the name of your dashboard?"),
      expectedDashboard.name,
    );

    await userEvent.click(screen.getByText("Create"));

    // api called with typed form input
    const createDashboardCall = fetchMock.callHistory.lastCall(
      `path:/api/dashboard`,
      {
        method: "POST",
      },
    );
    expect(await createDashboardCall?.request?.json()).toMatchObject({
      name: expectedDashboard.name,
      collection_id: anotherCollection.id,
    });
  });

  it('should resolve special collection name like "root" when passing "targetCollection"', async () => {
    const expectedDashboard = {
      name: "My awesome dashboard title",
    } satisfies Partial<Dashboard>;
    setupDashboardCreateEndpoint(expectedDashboard);

    setup({
      props: {
        targetCollection: "root",
      },
    });

    await waitFor(() => {
      expect(screen.getByText("New dashboard")).toBeInTheDocument();
    });

    expect(
      screen.queryByTestId("collection-picker-button"),
    ).not.toBeInTheDocument();

    await userEvent.type(
      screen.getByPlaceholderText("What is the name of your dashboard?"),
      expectedDashboard.name,
    );

    await userEvent.click(screen.getByText("Create"));

    // api called with typed form input
    const createDashboardCall = fetchMock.callHistory.lastCall(
      `path:/api/dashboard`,
      {
        method: "POST",
      },
    );
    expect(await createDashboardCall?.request?.json()).toMatchObject({
      name: expectedDashboard.name,
      collection_id: null,
    });
  });
});

interface SetupOpts {
  isLocaleLoading?: boolean;
  props?: Partial<CreateDashboardModalProps>;
  collections?: Collection[];
}

function setup({
  isLocaleLoading = false,
  props = {},
  collections = COLLECTIONS,
}: SetupOpts = {}) {
  useLocaleMock.mockReturnValue({ isLocaleLoading });

  setupCollectionByIdEndpoint({ collections });

  // Mock the "personal" collection endpoint since the component now passes string IDs directly
  fetchMock.get("path:/api/collection/personal", PERSONAL_COLLECTION);

  return renderWithSDKProviders(
    <CreateDashboardModal onCreate={jest.fn()} {...props} />,
    {
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
      storeInitialState: {
        currentUser: CURRENT_USER,
      },
    },
  );
}
