import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupEnterprisePlugins } from "__support__/enterprise";
import {
  setupCollectionByIdEndpoint,
  setupSchemaEndpoints,
  setupTableQueryMetadataEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import { ROOT_COLLECTION } from "metabase/common/collections/constants";
import { IsAdmin } from "metabase/route-guards";
import { Route } from "metabase/router";
import * as Urls from "metabase/urls";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { FieldId, Segment, TableId } from "metabase-types/api";
import {
  createMockCollection,
  createMockSegment,
  createMockTokenFeatures,
  createMockUser,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createPeopleTable,
  createProductsTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getDataStudioTableRoutes } from "./routes";

const SAMPLE_DB = createSampleDatabase();

function createFilterQuery({
  tableId,
  fieldId,
  operator,
  value,
}: {
  tableId: TableId;
  fieldId: FieldId;
  operator: "<" | ">";
  value: number;
}) {
  return Lib.createTestJsQuery(SAMPLE_PROVIDER, {
    stages: [
      {
        source: { type: "table", id: tableId },
        filters: [
          {
            type: "operator",
            operator,
            args: [
              { type: "column", fieldId },
              { type: "literal", value },
            ],
          },
        ],
      },
    ],
  });
}

const NEW_SEGMENT_ID = 77;

const DATA_COLLECTION = createMockCollection({
  id: 5,
  name: "Data",
  effective_ancestors: [
    createMockCollection(ROOT_COLLECTION),
    createMockCollection({ id: 4, name: "Library", type: "library" }),
  ],
});

const SEGMENT = createMockSegment({
  id: 12,
  name: "Segment to Delete",
  table_id: ORDERS_ID,
  definition: createFilterQuery({
    tableId: ORDERS_ID,
    fieldId: ORDERS.TOTAL,
    operator: "<",
    value: 100,
  }),
});

const OTHER_SEGMENT = createMockSegment({
  ...SEGMENT,
  id: 11,
  name: "Another Segment",
});

type SegmentRequest = {
  method: string;
  url: string;
  body: unknown;
};

type SetupOpts = {
  initialRoute: string;
  segments?: Segment[];
};

function setup({ initialRoute, segments = [] }: SetupOpts) {
  setupTableQueryMetadataEndpoint(
    createOrdersTable({
      db: SAMPLE_DB,
      collection: DATA_COLLECTION,
      segments,
    }),
  );
  setupTableQueryMetadataEndpoint(createProductsTable({ db: SAMPLE_DB }));
  setupTableQueryMetadataEndpoint(createPeopleTable({ db: SAMPLE_DB }));
  setupSchemaEndpoints(SAMPLE_DB);
  setupCollectionByIdEndpoint({ collections: [DATA_COLLECTION] });
  const requests = setupSegmentStore(segments);

  const state = createMockState({
    currentUser: createMockUser({ is_superuser: true }),
    settings: mockSettings({
      "token-features": createMockTokenFeatures({
        dependencies: true,
        library: true,
      }),
    }),
  });
  setupEnterprisePlugins();

  const { router } = renderWithProviders(
    <Route path="data-studio/library">
      {getDataStudioTableRoutes(IsAdmin)}
    </Route>,
    {
      withRouter: true,
      withUndos: true,
      initialRoute,
      storeInitialState: state,
    },
  );

  return { getPathname: () => router?.location.pathname, requests };
}

/**
 * Serves segments from a store that only the POST and PUT handlers change,
 * the way the backend stores a write.
 */
function setupSegmentStore(initialSegments: Segment[]) {
  const segments = new Map(initialSegments.map((s) => [s.id, s]));
  const requests: SegmentRequest[] = [];

  fetchMock.get(/\/api\/segment\/\d+$/, (call) => {
    const segment = segments.get(getSegmentId(call.url));
    return segment ?? { status: 404, body: "Not found" };
  });
  fetchMock.post("path:/api/segment", (call) => {
    const body: unknown = JSON.parse(String(call.options.body));
    requests.push({ method: "POST", url: "/api/segment", body });
    const segment = createMockSegment({
      ...getSegmentName(body),
      table_id: ORDERS_ID,
      id: NEW_SEGMENT_ID,
    });
    segments.set(segment.id, segment);
    return segment;
  });
  fetchMock.put(/\/api\/segment\/\d+$/, (call) => {
    const id = getSegmentId(call.url);
    const body: unknown = JSON.parse(String(call.options.body));
    requests.push({ method: "PUT", url: `/api/segment/${id}`, body });
    const segment = segments.get(id);
    if (!segment) {
      return { status: 404, body: "Not found" };
    }
    const updated = { ...segment, archived: true };
    segments.set(id, updated);
    return updated;
  });

  return requests;
}

function getSegmentId(url: string) {
  return Number(new URL(url).pathname.split("/").pop());
}

function getSegmentName(body: unknown): Partial<Segment> {
  return typeof body === "object" &&
    body != null &&
    "name" in body &&
    typeof body.name === "string"
    ? { name: body.name }
    : {};
}

describe("published table segment pages", () => {
  it("lists no segments yet, creates one, and opens it", async () => {
    const { getPathname, requests } = setup({
      initialRoute: Urls.dataStudioTableSegments(ORDERS_ID),
    });

    expect(await screen.findByText("No segments yet")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "href",
      Urls.dataStudioTable(ORDERS_ID),
    );
    expect(screen.getByRole("tab", { name: "Fields" })).toHaveAttribute(
      "href",
      Urls.dataStudioTableFields(ORDERS_ID),
    );
    expect(screen.getByRole("tab", { name: "Segments" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Segments" })).toHaveAttribute(
      "href",
      Urls.dataStudioTableSegments(ORDERS_ID),
    );

    await userEvent.click(screen.getByRole("link", { name: /New segment/ }));
    await waitFor(() => {
      expect(getPathname()).toBe(
        Urls.dataStudioPublishedTableSegmentNew(ORDERS_ID),
      );
    });

    await userEvent.type(
      await screen.findByPlaceholderText("New segment"),
      "Premium Orders",
    );
    await userEvent.click(
      await screen.findByText("Add filters to narrow your answer"),
    );
    await userEvent.click(
      within(await screen.findByRole("dialog")).getByText("Total"),
    );
    await userEvent.click(screen.getByLabelText("Filter operator"));
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Greater than" }),
    );
    await userEvent.type(await screen.findByLabelText("Filter value"), "100");
    await userEvent.click(screen.getByRole("button", { name: "Add filter" }));
    expect(
      await screen.findByText("Total is greater than 100"),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Segment created")).toBeInTheDocument();
    await waitFor(() => {
      expect(getPathname()).toBe(
        Urls.dataStudioPublishedTableSegment(ORDERS_ID, NEW_SEGMENT_ID),
      );
    });
    expect(
      await screen.findByDisplayValue("Premium Orders"),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      method: "POST",
      body: {
        name: "Premium Orders",
        definition: {
          database: SAMPLE_DB_ID,
          stages: [
            {
              "source-table": ORDERS_ID,
              filters: [
                [
                  ">",
                  expect.any(Object),
                  ["field", expect.any(Object), ORDERS.TOTAL],
                  100,
                ],
              ],
            },
          ],
        },
      },
    });
  });

  it("goes back through the collection breadcrumbs, opens a segment from the list, and returns to the list after removing it", async () => {
    const { getPathname, requests } = setup({
      initialRoute: Urls.dataStudioPublishedTableSegment(ORDERS_ID, SEGMENT.id),
      segments: [OTHER_SEGMENT, SEGMENT],
    });

    expect(
      await screen.findByDisplayValue("Segment to Delete"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("link", { name: "Data" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: "Orders" }));

    await waitFor(() => {
      expect(getPathname()).toBe(Urls.dataStudioTableSegments(ORDERS_ID));
    });

    await userEvent.click(
      await screen.findByRole("listitem", { name: "Segment to Delete" }),
    );
    await waitFor(() => {
      expect(getPathname()).toBe(
        Urls.dataStudioPublishedTableSegment(ORDERS_ID, SEGMENT.id),
      );
    });
    expect(
      await screen.findByDisplayValue("Segment to Delete"),
    ).toBeInTheDocument();

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
      expect(getPathname()).toBe(Urls.dataStudioTableSegments(ORDERS_ID));
    });
    expect(requests).toEqual([
      {
        method: "PUT",
        url: `/api/segment/${SEGMENT.id}`,
        body: {
          archived: true,
          revision_message: "Removed from Data Studio",
        },
      },
    ]);
  });
});
