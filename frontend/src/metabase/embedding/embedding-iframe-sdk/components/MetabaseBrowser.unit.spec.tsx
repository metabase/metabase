import userEvent from "@testing-library/user-event";

import {
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
  setupDashboardEndpoints,
  setupDashboardQueryMetadataEndpoint,
  setupNotificationChannelsEndpoints,
} from "__support__/server-mocks";
import { screen, within } from "__support__/ui";
import { SdkBreadcrumbsProvider } from "embedding-sdk-bundle/components/private/SdkBreadcrumbs/SdkBreadcrumbsProvider";
import { SdkInternalNavigationProvider } from "embedding-sdk-bundle/components/private/SdkInternalNavigation/SdkInternalNavigationProvider";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { useLocale } from "metabase/common/hooks/use-locale";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
  createMockDashboardQueryMetadata,
} from "metabase-types/api/mocks";

import type { SdkIframeEmbedSettings } from "../types/embed";

import { MetabaseBrowser } from "./MetabaseBrowser";

jest.mock("metabase/common/hooks/use-locale", () => ({
  useLocale: jest.fn(),
}));

// The mock replaces the whole module, so the hook has to be typed back here.
const useLocaleMock = useLocale as jest.Mock;

const ROOT_TEST_COLLECTION = createMockCollection({
  ...ROOT_COLLECTION,
  id: "root",
  name: "Our analytics",
  can_write: true,
});

const PERSONAL_COLLECTION_ID = 1;

const NESTED_COLLECTION_ID = 2;
const ROOT_DASHBOARD_ID = 10;

const NESTED_TEST_COLLECTION = createMockCollection({
  id: NESTED_COLLECTION_ID,
  name: "Nested Collection",
  location: "/",
  can_write: false,
  effective_ancestors: [ROOT_TEST_COLLECTION],
});

describe("MetabaseBrowser", () => {
  it("should walk in and back out of the virtual root", async () => {
    // Opening an entity pushes an entry onto the internal navigation stack.
    // Popping that entry must not overwrite the view the breadcrumb click asked
    // for, or every crumb click after a dashboard lands on the wrong collection.
    setup();

    expect(
      await screen.findByTestId("all-collections-list"),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByText("Our analytics"));
    expect(await screen.findByText("Nested Collection")).toBeInTheDocument();

    await userEvent.click(await screen.findByText("Nested Collection"));
    expect(await screen.findByText("Nested Dashboard")).toBeInTheDocument();

    await userEvent.click(getBreadcrumb("All collections"));
    expect(
      await screen.findByTestId("all-collections-list"),
    ).toBeInTheDocument();

    await userEvent.click(await screen.findByText("Our analytics"));
    await userEvent.click(await screen.findByText("Root Dashboard"));
    expect(await screen.findByTestId("dashboard-header")).toBeInTheDocument();

    await userEvent.click(getBreadcrumb("All collections"));

    const list = await screen.findByTestId("all-collections-list");
    expect(within(list).getByText("Our analytics")).toBeInTheDocument();
    expect(
      within(list).getByText("Your personal collection"),
    ).toBeInTheDocument();
  });

  it("should only show the create buttons inside a writable collection", async () => {
    // The virtual root resolves no collection, so `canWrite` is false there.
    setup();

    const list = await screen.findByTestId("all-collections-list");
    expect(queryNewQuestionButton()).not.toBeInTheDocument();
    expect(queryNewDashboardButton()).not.toBeInTheDocument();

    await userEvent.click(within(list).getByText("Your personal collection"));

    expect(await screen.findByText("Personal Dashboard")).toBeInTheDocument();
    expect(queryNewQuestionButton()).toBeInTheDocument();
    expect(queryNewDashboardButton()).toBeInTheDocument();

    await userEvent.click(getBreadcrumb("All collections"));

    expect(
      await screen.findByTestId("all-collections-list"),
    ).toBeInTheDocument();
    expect(queryNewQuestionButton()).not.toBeInTheDocument();
    expect(queryNewDashboardButton()).not.toBeInTheDocument();
  });
});

function getBreadcrumb(name: string) {
  return within(screen.getByTestId("sdk-breadcrumbs")).getByText(name);
}

function queryNewQuestionButton() {
  return screen.queryByRole("button", { name: "New question" });
}

function queryNewDashboardButton() {
  return screen.queryByRole("button", { name: "New dashboard" });
}

function setup() {
  useLocaleMock.mockReturnValue({ isLocaleLoading: false });

  const personalCollection = createMockCollection({
    id: PERSONAL_COLLECTION_ID,
    name: "Bobby Tables's Personal Collection",
    personal_owner_id: 1,
    is_personal: true,
    can_write: true,
  });

  const collections = [
    ROOT_TEST_COLLECTION,
    personalCollection,
    NESTED_TEST_COLLECTION,
  ];

  setupCollectionsEndpoints({
    collections,
    rootCollection: ROOT_TEST_COLLECTION,
  });
  setupCollectionByIdEndpoint({ collections });

  setupCollectionItemsEndpoint({
    collection: ROOT_TEST_COLLECTION,
    collectionItems: [
      createMockCollectionItem({
        id: ROOT_DASHBOARD_ID,
        model: "dashboard",
        name: "Root Dashboard",
      }),
      createMockCollectionItem({
        id: NESTED_COLLECTION_ID,
        model: "collection",
        name: NESTED_TEST_COLLECTION.name,
      }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: NESTED_TEST_COLLECTION,
    collectionItems: [
      createMockCollectionItem({
        id: 30,
        model: "dashboard",
        name: "Nested Dashboard",
      }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: personalCollection,
    collectionItems: [
      createMockCollectionItem({
        id: 20,
        model: "dashboard",
        name: "Personal Dashboard",
      }),
    ],
  });

  const rootDashboard = createMockDashboard({
    id: ROOT_DASHBOARD_ID,
    name: "Root Dashboard",
  });
  setupDashboardEndpoints(rootDashboard);
  setupDashboardQueryMetadataEndpoint(
    rootDashboard,
    createMockDashboardQueryMetadata(),
  );
  setupNotificationChannelsEndpoints({});

  const { state } = setupSdkState();

  const settings: SdkIframeEmbedSettings & {
    componentName: "metabase-browser";
  } = {
    componentName: "metabase-browser",
    instanceUrl: "http://localhost",
    initialCollection: "all",
    // `MetabaseBrowser` defaults `readOnly` to true when the key is absent.
    readOnly: false,
  };

  renderWithSDKProviders(
    <SdkInternalNavigationProvider keepChildrenMounted>
      <SdkBreadcrumbsProvider>
        <MetabaseBrowser settings={settings} />
      </SdkBreadcrumbsProvider>
    </SdkInternalNavigationProvider>,
    {
      componentProviderProps: { authConfig: createMockSdkConfig() },
      storeInitialState: state,
    },
  );
}
