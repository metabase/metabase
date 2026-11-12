import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { callMockEvent } from "__support__/events";
import {
  setupCardDataset,
  setupCollectionByIdEndpoint,
  setupCollectionItemsEndpoint,
  setupDatabasesEndpoints,
  setupRecentViewsAndSelectionsEndpoints,
  setupSearchEndpoints,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import {
  act,
  mockGetBoundingClientRect,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { getBeforeUnloadUnsavedMessage } from "metabase/common/hooks/use-before-unload";
import { Route } from "metabase/router";
import { checkNotNull } from "metabase/utils/types";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Segment } from "metabase-types/api";
import {
  createMockCollection,
  createMockSegment,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { SegmentApp } from "./SegmentApp";

const TestHome = () => <div />;

const SEGMENTS_URL = "/admin/datamodel/segments";
const FORM_URL = "/admin/datamodel/segment/create";
const EDIT_FORM_URL = "/admin/datamodel/segment/:id";

const CREATED_SEGMENT_ID = 42;

const EXISTING_SEGMENT = createMockSegment({
  id: 7,
  name: "Orders < 100",
  description: "All orders with a total under $100.",
  table_id: ORDERS_ID,
  definition: Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: ORDERS_ID },
        filters: [
          {
            type: "operator",
            operator: "<",
            args: [
              { type: "column", fieldId: ORDERS.TOTAL },
              { type: "literal", value: 100 },
            ],
          },
        ],
      },
    ],
  }),
});

interface SetupOpts {
  initialRoute?: string;
  segments?: Segment[];
}

const setup = ({ initialRoute = FORM_URL, segments = [] }: SetupOpts = {}) => {
  mockGetBoundingClientRect();
  setupDatabasesEndpoints([createSampleDatabase()]);
  setupSearchEndpoints([]);
  setupCardDataset({
    dataset: {
      data: {
        rows: [[1, 2, 3]],
      },
    },
  });
  setupRecentViewsAndSelectionsEndpoints([], ["selections"]);
  setupSegmentsEndpoints(segments);
  setupCollectionByIdEndpoint({
    collections: [
      createMockCollection({ id: "root" }),
      createMockCollection({ id: 1 }),
    ],
  });
  setupCollectionItemsEndpoint({
    collection: createMockCollection({ id: "root" }),
    collectionItems: [],
  });
  setupCollectionItemsEndpoint({
    collection: createMockCollection({ id: 1 }),
    collectionItems: [],
  });

  const { router } = renderWithProviders(
    <>
      <Route path="/" element={<TestHome />} />
      <Route path={SEGMENTS_URL} element={<TestHome />} />
      <Route path={FORM_URL} element={<SegmentApp />} />
      <Route path={EDIT_FORM_URL} element={<SegmentApp />} />
    </>,
    {
      initialRoute,
      withRouter: true,
    },
  );

  const mockEventListener = jest.spyOn(window, "addEventListener");

  return {
    router: checkNotNull(router),
    mockEventListener,
  };
};

describe("SegmentApp", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should have beforeunload event when user makes edits to a segment", async () => {
    const { mockEventListener } = setup();

    await userEvent.type(screen.getByLabelText("Name Your Segment"), "Name");

    const mockEvent = await waitFor(() => {
      return callMockEvent(mockEventListener, "beforeunload");
    });
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(getBeforeUnloadUnsavedMessage());
  });

  it("should not have an beforeunload event when segment is unedited", () => {
    const { mockEventListener } = setup();

    const mockEvent = callMockEvent(mockEventListener, "beforeunload");

    expect(mockEvent.preventDefault).not.toHaveBeenCalled();
    expect(mockEvent.returnValue).toBe(undefined);
  });

  it("does not show custom warning modal when leaving with no changes via SPA navigation", () => {
    const { router } = setup({ initialRoute: "/" });

    act(() => {
      router.navigate(FORM_URL);
      router.back();
    });

    expect(screen.queryByTestId("leave-confirmation")).not.toBeInTheDocument();
  });

  it("shows custom warning modal when leaving with unsaved changes via SPA navigation", async () => {
    const { router } = setup({ initialRoute: "/" });

    act(() => {
      router.navigate(FORM_URL);
    });

    await userEvent.type(
      await screen.findByLabelText("Name Your Segment"),
      "Name",
    );

    act(() => {
      router.back();
    });

    expect(await screen.findByTestId("leave-confirmation")).toBeInTheDocument();
  });

  it("does not show custom warning modal when saving changes", async () => {
    const { router } = setup();

    await userEvent.click(screen.getByText("Select a table"));

    await waitForLoaderToBeRemoved();

    await userEvent.click(await screen.findByText("Databases"));
    await userEvent.click(await screen.findByText("Sample Database"));
    await userEvent.click(await screen.findByText("Orders"));

    await waitForLoaderToBeRemoved();

    await userEvent.click(
      screen.getByText("Add filters to narrow your answer"),
    );
    await userEvent.click(screen.getByText("ID"));
    await userEvent.type(screen.getByPlaceholderText("Enter an ID"), "1");
    await userEvent.click(screen.getByText("Add filter"));
    await userEvent.type(screen.getByLabelText("Name Your Segment"), "Name");
    await userEvent.type(
      screen.getByLabelText("Describe Your Segment"),
      "Description",
    );

    await waitFor(() => {
      expect(screen.getByText("Save changes")).toBeEnabled();
    });

    await userEvent.click(screen.getByText("Save changes"));

    await waitFor(() => {
      expect(router.location.pathname).toBe(SEGMENTS_URL);
    });

    expect(screen.queryByTestId("leave-confirmation")).not.toBeInTheDocument();
  });

  it("offers custom expressions in the filter list and creates the segment with the chosen filter (metabase#13069)", async () => {
    const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
    // Registered before `setup`, so it answers the create request first.
    fetchMock.post("path:/api/segment", async (call) => {
      const body: unknown = await call.request?.clone().json();
      return createMockSegment({
        ...(typeof body === "object" ? body : {}),
        id: CREATED_SEGMENT_ID,
      });
    });
    const { router } = setup();

    await userEvent.click(screen.getByText("Select a table"));
    await waitForLoaderToBeRemoved();
    await userEvent.click(await screen.findByText("Databases"));
    await userEvent.click(await screen.findByText("Sample Database"));
    await userEvent.click(await screen.findByText("Orders"));
    await waitForLoaderToBeRemoved();

    const editor = screen.getByTestId("segment-editor");
    expect(await within(editor).findByText("Orders")).toBeInTheDocument();

    await userEvent.click(
      within(editor).getByRole("button", {
        name: /Add filters to narrow your answer/,
      }),
    );
    const popover = await screen.findByRole("dialog");
    expect(within(popover).getByText("Custom Expression")).toBeInTheDocument();

    await userEvent.click(within(popover).getByText("Total"));
    await userEvent.click(await screen.findByLabelText("Filter operator"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Greater than" }),
    );
    await userEvent.type(screen.getByLabelText("Filter value"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));

    await userEvent.type(
      screen.getByLabelText("Name Your Segment"),
      "High Value Orders",
    );
    await userEvent.type(
      screen.getByLabelText("Describe Your Segment"),
      "Orders with high values",
    );
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Save changes" }),
      ).toBeEnabled();
    });
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(router.location.pathname).toBe(SEGMENTS_URL);
    });

    const createCall = fetchMock.callHistory.lastCall("path:/api/segment", {
      method: "POST",
    });
    const createBody: unknown = await createCall?.request?.json();
    expect(createBody).toMatchObject({
      name: "High Value Orders",
      description: "Orders with high values",
      table_id: ORDERS_ID,
      definition: {
        "lib/type": "mbql/query",
        database: SAMPLE_DB_ID,
        stages: [
          {
            "source-table": ORDERS_ID,
            filters: [
              [
                ">",
                expect.anything(),
                ["field", expect.anything(), ORDERS.TOTAL],
                100,
              ],
            ],
          },
        ],
      },
    });

    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "segment_created",
      triggered_from: "admin_datamodel_segments",
      result: "success",
      target_id: CREATED_SEGMENT_ID,
    });
  });

  it("shows an existing segment in the edit form", async () => {
    setup({
      initialRoute: `/admin/datamodel/segment/${EXISTING_SEGMENT.id}`,
      segments: [EXISTING_SEGMENT],
    });

    expect(await screen.findByText("Edit Your Segment")).toBeInTheDocument();
    expect(screen.getByLabelText("Name Your Segment")).toHaveValue(
      "Orders < 100",
    );
    expect(screen.getByLabelText("Describe Your Segment")).toHaveValue(
      "All orders with a total under $100.",
    );

    const editor = screen.getByTestId("segment-editor");
    expect(
      await within(editor).findByText("Sample Database"),
    ).toBeInTheDocument();
    expect(within(editor).getByText("Orders")).toBeInTheDocument();
    expect(
      within(editor).getByText(/Total is less than 100/),
    ).toBeInTheDocument();
    expect(
      await within(editor).findByRole("link", { name: "Preview" }),
    ).toBeInTheDocument();
  });
});
