import userEvent from "@testing-library/user-event";

import {
  setupAdhocQueryMetadataEndpoint,
  setupCollectionByIdEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { createMockEntitiesState } from "metabase/metadata-store";
import { Route } from "metabase/router";
import {
  createMockCardQueryMetadata,
  createMockCollection,
} from "metabase-types/api/mocks";
import { createSampleDatabase } from "metabase-types/api/mocks/presets";

import { NewMetricPage } from "./NewMetricPage";

function BrowseMetricsPage() {
  return <h1>Browse metrics page</h1>;
}

function setup() {
  const database = createSampleDatabase();
  setupDatabasesEndpoints([database]);
  setupSearchEndpoints([]);
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupCollectionByIdEndpoint({
    collections: [createMockCollection(ROOT_COLLECTION)],
  });
  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({ databases: [database] }),
  );

  return renderWithProviders(
    <>
      <Route path="/browse/metrics" element={<BrowseMetricsPage />} />
      <Route path="/metric/new" element={<NewMetricPage />} />
    </>,
    {
      withRouter: true,
      initialRoute: "/browse/metrics",
      storeInitialState: createMockState({
        entities: createMockEntitiesState({ databases: [database] }),
      }),
    },
  );
}

describe("NewMetricPage", () => {
  const originalScrollBy = HTMLElement.prototype.scrollBy;

  beforeEach(() => {
    // The mini picker lists items with @tanstack/react-virtual, which renders
    // nothing in jsdom without element sizes and scrollBy.
    mockGetBoundingClientRect({ width: 1, height: 1 });
    HTMLElement.prototype.scrollBy = jest.fn();
  });

  afterEach(() => {
    HTMLElement.prototype.scrollBy = originalScrollBy;
    jest.restoreAllMocks();
  });

  it("asks to discard a new metric on cancel and goes back to the metrics page (metabase#48024)", async () => {
    const { router } = setup();

    await screen.findByRole("heading", { name: "Browse metrics page" });
    act(() => {
      router?.navigate("/metric/new");
    });
    const editor = await screen.findByTestId("metric-query-editor");

    const miniPicker = await screen.findByTestId("mini-picker");
    await userEvent.click(
      await within(miniPicker).findByText("Sample Database"),
    );
    await userEvent.click(await within(miniPicker).findByText("Orders"));
    await waitFor(() =>
      expect(screen.queryByTestId("mini-picker")).not.toBeInTheDocument(),
    );
    expect(within(editor).getByText("Orders")).toBeInTheDocument();

    await userEvent.click(
      within(editor).getByRole("button", { name: "Cancel" }),
    );
    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText("Discard your changes?"),
    ).toBeInTheDocument();
    await userEvent.click(
      within(modal).getByRole("button", { name: "Discard changes" }),
    );

    expect(
      await screen.findByRole("heading", { name: "Browse metrics page" }),
    ).toBeInTheDocument();
    expect(router?.location.pathname).toBe("/browse/metrics");
    expect(screen.queryByTestId("metric-query-editor")).not.toBeInTheDocument();
  });
});
