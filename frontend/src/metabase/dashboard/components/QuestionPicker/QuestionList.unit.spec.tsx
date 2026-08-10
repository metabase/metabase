import userEvent from "@testing-library/user-event";

import {
  setupCollectionItemsEndpoint,
  setupCollectionsEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import { getNextId } from "__support__/utils";
import { ROOT_COLLECTION as ROOT } from "metabase/common/collections/constants";
import { MockDashboardContext } from "metabase/dashboard/context/mock-context";
import {
  createMockDashboardState,
  createMockState,
} from "metabase/redux/store/mocks";
import type { CollectionItem, Dashboard } from "metabase-types/api";
import {
  createMockCollection,
  createMockCollectionItem,
  createMockDashboard,
} from "metabase-types/api/mocks";

import { QuestionList } from "./QuestionList";

const ROOT_COLLECTION = createMockCollection({
  ...ROOT,
  can_write: true,
});

const CUSTOM_VIZ_ITEM: CollectionItem = createMockCollectionItem({
  id: getNextId(),
  model: "card",
  name: "Custom viz question",
  display: "custom:my-viz",
});

const REGULAR_ITEM: CollectionItem = createMockCollectionItem({
  id: getNextId(),
  model: "card",
  name: "Regular question",
  display: "bar",
});

interface SetupOpts {
  dashboard?: Dashboard;
}

async function setup({
  dashboard = createMockDashboard({ collection: ROOT_COLLECTION }),
}: SetupOpts = {}) {
  const onSelect = jest.fn();

  setupCollectionsEndpoints({ collections: [ROOT_COLLECTION] });
  setupCollectionItemsEndpoint({
    collection: ROOT_COLLECTION,
    collectionItems: [CUSTOM_VIZ_ITEM, REGULAR_ITEM],
  });

  renderWithProviders(
    <MockDashboardContext
      dashboardId={dashboard.id}
      navigateToNewCardFromDashboard={null}
    >
      <QuestionList
        searchText=""
        collectionId={ROOT_COLLECTION.id}
        onSelect={onSelect}
        hasCollections={false}
        showOnlyPublicCollections={false}
      />
    </MockDashboardContext>,
    {
      storeInitialState: createMockState({
        dashboard: createMockDashboardState({
          dashboards: {
            [dashboard.id]: { ...dashboard, dashcards: [] },
          },
          dashboardId: dashboard.id,
        }),
      }),
    },
  );

  await waitFor(() => {
    expect(screen.queryByText("Loading...")).not.toBeInTheDocument();
  });

  return { onSelect };
}

describe("QuestionList", () => {
  it("disables a custom-viz item and shows a tooltip when the dashboard is public", async () => {
    const dashboard = createMockDashboard({
      collection: ROOT_COLLECTION,
      public_uuid: "abc123",
    });
    const { onSelect } = await setup({ dashboard });

    const customVizItem = screen.getByRole("menuitem", {
      name: CUSTOM_VIZ_ITEM.name,
    });
    expect(customVizItem).toHaveAttribute("aria-disabled", "true");

    await userEvent.click(customVizItem);
    expect(onSelect).not.toHaveBeenCalled();

    await userEvent.hover(customVizItem);
    expect(
      await screen.findByText(
        "This chart uses a custom visualization, which isn't supported in public links.",
      ),
    ).toBeInTheDocument();

    const regularItem = screen.getByRole("menuitem", {
      name: REGULAR_ITEM.name,
    });
    expect(regularItem).not.toHaveAttribute("aria-disabled");

    await userEvent.click(regularItem);
    expect(onSelect).toHaveBeenCalledWith(REGULAR_ITEM.id, expect.anything());
  });

  it("leaves items enabled when the dashboard is not public", async () => {
    const dashboard = createMockDashboard({
      collection: ROOT_COLLECTION,
      public_uuid: null,
    });
    const { onSelect } = await setup({ dashboard });

    const customVizItem = screen.getByRole("menuitem", {
      name: CUSTOM_VIZ_ITEM.name,
    });
    expect(customVizItem).not.toHaveAttribute("aria-disabled");

    await userEvent.click(customVizItem);
    expect(onSelect).toHaveBeenCalledWith(
      CUSTOM_VIZ_ITEM.id,
      expect.anything(),
    );
  });
});
