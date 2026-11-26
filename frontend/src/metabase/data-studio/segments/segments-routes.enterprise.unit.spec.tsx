import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import _ from "underscore";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupDatabasesEndpoints,
  setupEntityRevisionsEndpoint,
  setupFieldSearchValuesEndpoint,
  setupFieldValuesEndpoint,
  setupLibraryEndpoints,
  setupListDatabaseSchemasEndpoint,
  setupSegmentStoreEndpoints,
  setupTableQueryMetadataEndpoint,
  setupUserAcknowledgementEndpoints,
  setupUsersEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { getDataStudioMetadataRoutes } from "metabase/data-studio/data-model/routes";
import { createSegmentFilterDefinition } from "metabase/data-studio/segments/test-utils";
import { IsAdmin } from "metabase/route-guards";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import { defer } from "metabase/utils/promise";
import type { Segment, Table, TableId } from "metabase-types/api";
import {
  createMockRevision,
  createMockSegment,
  createMockTokenFeatures,
  createMockUser,
  createMockUserListResult,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE,
  PEOPLE_ID,
  PRODUCTS,
  PRODUCTS_ID,
  PRODUCT_CATEGORY_VALUES,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

const SAMPLE_DB = createSampleDatabase();

const NEW_SEGMENT_ID = 77;

const ORDERS_SEGMENT = createMockSegment({
  id: 12,
  name: "Test Segment",
  description: "Test description",
  table_id: ORDERS_ID,
  definition: createSegmentFilterDefinition({
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
    operator: "<",
    value: 100,
  }),
});

const PRODUCTS_SEGMENT = createMockSegment({
  id: 13,
  name: "Expensive Products",
  table_id: PRODUCTS_ID,
  definition: createSegmentFilterDefinition({
    tableId: PRODUCTS_ID,
    fieldId: PRODUCTS.PRICE,
    operator: ">",
    value: 50,
  }),
});

const ORDERS_TABLE = createOrdersTable({ db: SAMPLE_DB, segments: [] });
const PRODUCTS_TABLE = createProductsTable({
  db: SAMPLE_DB,
  segments: [PRODUCTS_SEGMENT],
});
const PEOPLE_TABLE = createPeopleTable({ db: SAMPLE_DB, segments: [] });

type SetupOpts = {
  initialRoute: string;
  segments?: Segment[];
  isAdmin?: boolean;
  ordersTable?: Table;
  /** The schemas response, which the breadcrumbs wait for, waits for this. */
  schemasGate?: Promise<unknown>;
};

function setup({
  initialRoute,
  segments = [],
  isAdmin = true,
  ordersTable = ORDERS_TABLE,
  schemasGate,
}: SetupOpts) {
  [ordersTable, PRODUCTS_TABLE, PEOPLE_TABLE].forEach(
    setupTableQueryMetadataEndpoint,
  );
  // Registered before the database mocks below, so that these routes win.
  setupListDatabaseSchemasEndpoint(SAMPLE_DB_ID, ["PUBLIC"], {
    responseGate: schemasGate,
  });
  // Without `include`, the backend sends a database without its tables, so the
  // pages must load the joined tables' metadata themselves. No server-mock
  // helper serves that shape next to the table list the data model page needs.
  fetchMock.get(
    `path:/api/database/${SAMPLE_DB_ID}`,
    _.omit(SAMPLE_DB, "tables"),
  );
  // The segments tab, where a removal lands, is the data model page.
  setupDatabasesEndpoints([SAMPLE_DB]);
  setupLibraryEndpoints();
  setupUsersEndpoints([createMockUserListResult()]);
  setupUserAcknowledgementEndpoints({
    key: "seen-publish-tables-info",
    value: false,
  });
  setupFieldValuesEndpoint(PRODUCT_CATEGORY_VALUES);
  const segmentStore = setupSegmentStoreEndpoints(segments, {
    createdSegmentId: NEW_SEGMENT_ID,
  });

  const state = createMockState({
    currentUser: createMockUser({
      is_superuser: isAdmin,
      is_data_analyst: !isAdmin,
    }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        dependencies: true,
        library: true,
      }),
    }),
  });
  setupEnterprisePlugins();

  const { router } = renderWithProviders(
    <>
      <Route path="data-studio/data">
        {getDataStudioMetadataRoutes(IsAdmin)}
      </Route>
      <Route path="unauthorized" element={<h1>Unauthorized page</h1>} />
    </>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute,
      storeInitialState: state,
    },
  );

  return {
    getPathname: () => router?.location.pathname,
    requests: segmentStore.requests,
    holdNextSegmentGet: segmentStore.holdNextGet,
  };
}

function segmentsUrl(tableId: TableId) {
  return Urls.dataStudioData({
    databaseId: SAMPLE_DB_ID,
    schemaName: "PUBLIC",
    tableId,
    tab: "segments",
  });
}

function newSegmentUrl(tableId: TableId) {
  return Urls.newDataStudioDataModelSegment({
    databaseId: SAMPLE_DB_ID,
    schemaName: "PUBLIC",
    tableId,
  });
}

function segmentUrl(tableId: TableId, segmentId: number) {
  return Urls.dataStudioDataModelSegment({
    databaseId: SAMPLE_DB_ID,
    schemaName: "PUBLIC",
    tableId,
    segmentId,
  });
}

async function openFilterPicker() {
  await userEvent.click(
    await screen.findByText("Add filters to narrow your answer"),
  );
  return await screen.findByRole("dialog");
}

async function setOperator(operator: string) {
  await userEvent.click(screen.getByLabelText("Filter operator"));
  await userEvent.click(
    await screen.findByRole("menuitem", { name: operator }),
  );
}

async function addNumberFilter(
  column: string,
  operator: string,
  value: string,
) {
  const popover = await openFilterPicker();
  await userEvent.click(within(popover).getByText(column));
  await setOperator(operator);
  await userEvent.type(await screen.findByLabelText("Filter value"), value);
  await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
}

function getNameInput() {
  return screen.getByPlaceholderText("New segment");
}

/**
 * The filters of the MBQL 5 query that `Lib.toJsQuery` puts in the request.
 */
function getStageFilters(body: unknown): unknown {
  if (
    typeof body === "object" &&
    body != null &&
    "definition" in body &&
    typeof body.definition === "object" &&
    body.definition != null &&
    "stages" in body.definition &&
    Array.isArray(body.definition.stages)
  ) {
    const [stage]: unknown[] = body.definition.stages;
    if (typeof stage === "object" && stage != null && "filters" in stage) {
      return stage.filters;
    }
  }
  return undefined;
}

describe("segment pages in the data model", () => {
  beforeEach(() => {
    jest.spyOn(Analytics, "trackSimpleEvent");
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("new segment", () => {
    it("asks to discard changes when leaving through the breadcrumb, and keeps the form on cancel", async () => {
      const schemas = defer<void>();
      const { getPathname } = setup({
        initialRoute: newSegmentUrl(ORDERS_ID),
        schemasGate: schemas.promise,
      });

      await userEvent.type(
        await screen.findByPlaceholderText("New segment"),
        "Premium Orders",
      );
      // The breadcrumbs stay hidden until the schemas load.
      expect(
        screen.queryByRole("link", { name: "Orders" }),
      ).not.toBeInTheDocument();
      schemas.resolve();
      await userEvent.click(
        await screen.findByRole("link", { name: "Orders" }),
      );

      const modal = await screen.findByRole("dialog");
      expect(
        within(modal).getByText("Discard your changes?"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Cancel" }),
      );

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
      expect(getNameInput()).toHaveValue("Premium Orders");
      expect(getPathname()).toBe(newSegmentUrl(ORDERS_ID));
    });

    it("creates a segment with a number filter and opens it", async () => {
      const { getPathname, requests } = setup({
        initialRoute: newSegmentUrl(ORDERS_ID),
      });

      await userEvent.type(
        await screen.findByPlaceholderText("New segment"),
        "Premium Orders",
      );
      await addNumberFilter("Total", "Greater than", "100");
      expect(
        await screen.findByText("Total is greater than 100"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Segment created")).toBeInTheDocument();
      await waitFor(() => {
        expect(getPathname()).toBe(segmentUrl(ORDERS_ID, NEW_SEGMENT_ID));
      });
      expect(
        await screen.findByDisplayValue("Premium Orders"),
      ).toBeInTheDocument();

      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("POST");
      expect(requests[0].body).toMatchObject({
        name: "Premium Orders",
        definition: {
          database: SAMPLE_DB_ID,
          stages: [{ "source-table": ORDERS_ID }],
        },
      });
      expect(getStageFilters(requests[0].body)).toEqual([
        [
          ">",
          expect.any(Object),
          ["field", expect.any(Object), ORDERS.TOTAL],
          100,
        ],
      ]);

      expect(Analytics.trackSimpleEvent).toHaveBeenCalledWith({
        event: "segment_created",
        triggered_from: "data_studio_segments",
        result: "success",
        target_id: NEW_SEGMENT_ID,
      });
    });

    it("searches the values of a field in search mode", async () => {
      setupFieldSearchValuesEndpoint(
        PEOPLE.EMAIL,
        PEOPLE.EMAIL,
        "borer-hudson@yahoo.com",
        [["borer-hudson@yahoo.com"]],
      );
      setup({ initialRoute: newSegmentUrl(PEOPLE_ID) });

      const popover = await openFilterPicker();
      await userEvent.click(within(popover).getByText("Email"));

      await userEvent.type(
        await within(popover).findByRole("combobox"),
        "borer-hudson@yahoo.com",
      );

      expect(
        await within(await screen.findByRole("listbox")).findByText(
          "borer-hudson@yahoo.com",
        ),
      ).toBeInTheDocument();

      // The mock answers only this field, search field and value; check the
      // request too, so a changed request fails here and not only as an
      // unmatched call.
      const searchUrls = fetchMock.callHistory
        .calls(`path:/api/field/${PEOPLE.EMAIL}/search/${PEOPLE.EMAIL}`)
        .map((call) => new URL(call.url));
      expect(searchUrls.at(-1)?.searchParams.get("value")).toBe(
        "borer-hudson@yahoo.com",
      );
    });

    it("lists the values of a field in list mode, closes on Escape, and offers a preview once a filter exists", async () => {
      setup({ initialRoute: newSegmentUrl(PRODUCTS_ID) });

      const popover = await openFilterPicker();
      // The joined-table test below expects this segment to stay hidden.
      expect(
        within(popover).getByText(PRODUCTS_SEGMENT.name),
      ).toBeInTheDocument();
      await userEvent.click(within(popover).getByText("Category"));

      expect(
        await within(popover).findByPlaceholderText("Search the list"),
      ).toBeInTheDocument();
      for (const value of ["Widget", "Gadget", "Gizmo", "Doohickey"]) {
        expect(within(popover).getByText(value)).toBeInTheDocument();
      }

      await userEvent.keyboard("{Escape}");
      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });

      await addNumberFilter("Price", "Less than", "50");
      expect(
        await screen.findByText("Price is less than 50"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Segment actions"));
      expect(
        await screen.findByRole("menuitem", { name: /Preview/ }),
      ).toBeInTheDocument();
    });

    it("lists the values of an implicitly joined field, hides the joined table's segments, and saves the segment", async () => {
      const ordersSegment = createMockSegment({
        ...ORDERS_SEGMENT,
        name: "Big Orders",
      });
      const { requests } = setup({
        initialRoute: newSegmentUrl(ORDERS_ID),
        ordersTable: { ...ORDERS_TABLE, segments: [ordersSegment] },
      });

      await userEvent.type(
        await screen.findByPlaceholderText("New segment"),
        "Gadget Orders",
      );
      const popover = await openFilterPicker();

      expect(within(popover).getByText("Big Orders")).toBeInTheDocument();
      await userEvent.click(await within(popover).findByText("Product"));
      expect(await within(popover).findByText("Category")).toBeInTheDocument();
      expect(
        within(popover).queryByText("Expensive Products"),
      ).not.toBeInTheDocument();

      await userEvent.click(within(popover).getByText("Category"));
      expect(
        await within(popover).findByPlaceholderText("Search the list"),
      ).toBeInTheDocument();
      for (const value of ["Widget", "Gadget", "Gizmo", "Doohickey"]) {
        expect(within(popover).getByText(value)).toBeInTheDocument();
      }
      await userEvent.click(within(popover).getByText("Gadget"));
      await userEvent.click(
        within(popover).getByRole("button", { name: "Add filter" }),
      );

      expect(
        await screen.findByText("Product → Category is Gadget"),
      ).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await screen.findByText("Segment created")).toBeInTheDocument();
      expect(
        await screen.findByDisplayValue("Gadget Orders"),
      ).toBeInTheDocument();

      expect(requests).toHaveLength(1);
      expect(requests[0].body).toMatchObject({ name: "Gadget Orders" });
      expect(getStageFilters(requests[0].body)).toEqual([
        [
          "=",
          expect.any(Object),
          [
            "field",
            expect.objectContaining({ "source-field": ORDERS.PRODUCT_ID }),
            PRODUCTS.CATEGORY,
          ],
          "Gadget",
        ],
      ]);
    });
  });

  describe("existing segment", () => {
    it("renames a segment on Enter, saves a description change, and returns to the segments tab through the breadcrumb", async () => {
      const { getPathname, requests, holdNextSegmentGet } = setup({
        initialRoute: segmentUrl(ORDERS_ID, ORDERS_SEGMENT.id),
        segments: [ORDERS_SEGMENT],
      });

      const nameInput = await screen.findByDisplayValue("Test Segment");
      expect(screen.getByLabelText("Give it a description")).toHaveTextContent(
        "Test description",
      );

      // The rename refetches the segment; hold that response so the test
      // sees the state before it arrives.
      const releaseRefetch = holdNextSegmentGet();
      await userEvent.type(nameInput, " Updated{enter}");
      expect(
        await screen.findByText("Segment name updated"),
      ).toBeInTheDocument();
      // The breadcrumb shows the stored segment, unlike the name input,
      // which holds what was typed.
      expect(
        screen.getByText("Test Segment", { selector: "span" }),
      ).toBeInTheDocument();
      releaseRefetch();
      expect(
        await screen.findByText("Test Segment Updated", { selector: "span" }),
      ).toBeInTheDocument();
      expect(requests).toEqual([
        {
          method: "PUT",
          url: `/api/segment/${ORDERS_SEGMENT.id}`,
          body: {
            name: "Test Segment Updated",
            revision_message: "Updated segment name",
          },
        },
      ]);

      await userEvent.click(screen.getByLabelText("Give it a description"));
      const descriptionInput = screen.getByPlaceholderText(
        "Only if it really needs it",
      );
      await userEvent.clear(descriptionInput);
      await userEvent.type(descriptionInput, "Updated description");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() => {
        expect(
          screen.queryByRole("button", { name: "Save" }),
        ).not.toBeInTheDocument();
      });
      expect(requests).toHaveLength(2);
      expect(requests[1]).toEqual({
        method: "PUT",
        url: `/api/segment/${ORDERS_SEGMENT.id}`,
        body: {
          // The rename refetched the segment, so the save keeps the new name.
          name: "Test Segment Updated",
          description: "Updated description",
          definition: ORDERS_SEGMENT.definition,
          revision_message: "Updated from Data Studio",
        },
      });

      await userEvent.click(screen.getByRole("link", { name: "Orders" }));
      await waitFor(() => {
        expect(getPathname()).toBe(segmentsUrl(ORDERS_ID));
      });
      expect(
        await screen.findByRole("tab", { name: /Segments/ }),
      ).toHaveAttribute("aria-selected", "true");
    });

    it("removes a segment from the actions menu and returns to the segments tab", async () => {
      const { getPathname, requests } = setup({
        initialRoute: segmentUrl(ORDERS_ID, ORDERS_SEGMENT.id),
        segments: [ORDERS_SEGMENT],
      });

      await screen.findByDisplayValue("Test Segment");
      await userEvent.click(screen.getByLabelText("Segment actions"));
      await userEvent.click(
        await screen.findByRole("menuitem", { name: /Remove segment/ }),
      );
      await userEvent.click(
        within(await screen.findByRole("dialog")).getByRole("button", {
          name: "Remove",
        }),
      );

      expect(await screen.findByText("Segment removed")).toBeInTheDocument();
      await waitFor(() => {
        expect(getPathname()).toBe(segmentsUrl(ORDERS_ID));
      });
      expect(requests).toEqual([
        {
          method: "PUT",
          url: `/api/segment/${ORDERS_SEGMENT.id}`,
          body: {
            archived: true,
            revision_message: "Removed from Data Studio",
          },
        },
      ]);
    });

    it("shows the revision history of a segment in its own tab", async () => {
      setupEntityRevisionsEndpoint("segment", ORDERS_SEGMENT.id, [
        createMockRevision({
          id: 4,
          is_creation: false,
          diff: {
            definition: {
              before: ORDERS_SEGMENT.definition,
              after: createSegmentFilterDefinition({
                tableId: ORDERS_ID,
                fieldId: ORDERS.TOTAL,
                operator: ">",
                value: 100,
              }),
            },
          },
        }),
        createMockRevision({
          id: 3,
          is_creation: false,
          diff: { description: { before: "Old", after: "New" } },
        }),
        createMockRevision({
          id: 2,
          is_creation: false,
          diff: { name: { before: "Original Name", after: "Updated Name" } },
        }),
        createMockRevision({ id: 1, is_creation: true, diff: null }),
      ]);
      const { getPathname } = setup({
        initialRoute: segmentUrl(ORDERS_ID, ORDERS_SEGMENT.id),
        segments: [ORDERS_SEGMENT],
      });

      await screen.findByDisplayValue("Test Segment");
      await userEvent.click(
        screen.getByRole("tab", { name: /Revision history/ }),
      );

      await waitFor(() => {
        expect(getPathname()).toBe(
          `${segmentUrl(ORDERS_ID, ORDERS_SEGMENT.id)}/revisions`,
        );
      });
      expect(
        await screen.findByText("created this segment"),
      ).toBeInTheDocument();
      expect(screen.getByText("renamed the segment")).toBeInTheDocument();
      expect(screen.getByText("updated the description")).toBeInTheDocument();
      expect(
        screen.getByText("changed the filter definition"),
      ).toBeInTheDocument();
      expect(
        await screen.findByText("Total is greater than 100"),
      ).toBeInTheDocument();
    });
  });

  describe("non-admin user", () => {
    it("shows a segment read-only and keeps its revision history", async () => {
      setupEntityRevisionsEndpoint("segment", ORDERS_SEGMENT.id, [
        createMockRevision({ id: 1, is_creation: true, diff: null }),
      ]);
      const { getPathname } = setup({
        initialRoute: segmentUrl(ORDERS_ID, ORDERS_SEGMENT.id),
        segments: [ORDERS_SEGMENT],
        isAdmin: false,
      });

      expect(await screen.findByDisplayValue("Test Segment")).toBeDisabled();
      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
      expect(
        await screen.findByText("Total is less than 100"),
      ).toBeInTheDocument();

      await userEvent.click(screen.getByLabelText("Segment actions"));
      expect(
        await screen.findByRole("menuitem", { name: /Preview/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: /Remove segment/ }),
      ).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      await userEvent.click(
        screen.getByRole("tab", { name: /Revision history/ }),
      );
      expect(
        await screen.findByText("created this segment"),
      ).toBeInTheDocument();
      expect(getPathname()).toBe(
        `${segmentUrl(ORDERS_ID, ORDERS_SEGMENT.id)}/revisions`,
      );
    });

    it("redirects a non-admin away from the new segment page", async () => {
      const { getPathname } = setup({
        initialRoute: newSegmentUrl(ORDERS_ID),
        isAdmin: false,
      });

      expect(await screen.findByText("Unauthorized page")).toBeInTheDocument();
      expect(getPathname()).toBe("/unauthorized");
      expect(
        screen.queryByPlaceholderText("New segment"),
      ).not.toBeInTheDocument();
    });

    it("lets an admin open the new segment page", async () => {
      const { getPathname } = setup({
        initialRoute: newSegmentUrl(ORDERS_ID),
      });

      expect(
        await screen.findByPlaceholderText("New segment"),
      ).toBeInTheDocument();
      expect(getPathname()).toBe(newSegmentUrl(ORDERS_ID));
    });
  });
});
