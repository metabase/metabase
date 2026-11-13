import userEvent from "@testing-library/user-event";

import {
  setupDatabaseEndpoints,
  setupDatabaseMetadataEndpoint,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderRoutes, screen, within } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import type { RouteObject } from "metabase/router";
import { createMockSegment, createMockUser } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { getReferenceRoutes } from "../routes";

const DATABASE = createSampleDatabase();

const PEOPLE_SEGMENT = createMockSegment({
  id: 1,
  name: "People from Twitter",
  description: "People who signed up from Twitter",
  table_id: PEOPLE_ID,
});

// An id that differs from its table id, so a link built from the wrong one
// opens a different page.
const ORDERS_SEGMENT = createMockSegment({
  id: 42,
  name: "Orders < 100",
  description: "All orders with a total under $100.",
  table_id: ORDERS_ID,
});

const XRAY_ROUTE: RouteObject = {
  path: "/auto/dashboard/segment/:segmentId",
  element: <div>X-ray dashboard</div>,
};

interface SetupOpts {
  initialRoute: string;
}

function setup({ initialRoute }: SetupOpts) {
  const trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");

  setupSegmentsEndpoints([PEOPLE_SEGMENT, ORDERS_SEGMENT]);
  setupDatabaseEndpoints(DATABASE);
  setupDatabaseMetadataEndpoint(DATABASE);

  renderRoutes([...getReferenceRoutes(), XRAY_ROUTE], {
    initialRoute,
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: true }),
      settings: mockSettings({ "enable-xrays": true }),
    }),
  });

  return { trackSimpleEvent };
}

describe("reference segment pages", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("opens a segment from the list, then its fields", async () => {
    setup({ initialRoute: "/reference/segments" });

    const items = await screen.findAllByTestId("data-reference-list-item");
    expect(items).toHaveLength(2);
    const ordersItem = items.find((item) =>
      within(item).queryByText(ORDERS_SEGMENT.name),
    );
    if (ordersItem == null) {
      throw new Error("The Orders segment is not listed");
    }
    await userEvent.click(within(ordersItem).getByText(ORDERS_SEGMENT.name));

    expect(await screen.findByText("Description")).toBeInTheDocument();
    expect(
      await screen.findByText(ORDERS_SEGMENT.description),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "See this segment" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("link", { name: /Fields in this segment/ }),
    );

    expect(
      await screen.findByText(`Fields in ${ORDERS_SEGMENT.name}`),
    ).toBeInTheDocument();
    // The display name and the semantic type of the Discount field.
    expect(await screen.findAllByText("Discount")).toHaveLength(2);
    expect(
      screen.queryByRole("link", { name: "See this segment" }),
    ).not.toBeInTheDocument();
  });

  it("does not crash when editing a field of a segment (metabase#55322)", async () => {
    setup({
      initialRoute: `/reference/segments/${ORDERS_SEGMENT.id}/fields/${ORDERS.TAX}`,
    });

    expect(
      await screen.findByText("Actual name in database"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("TAX")).not.toHaveLength(0);

    await userEvent.click(screen.getByRole("button", { name: /Edit/ }));

    expect(
      await screen.findByPlaceholderText("No description yet"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Something’s gone wrong"),
    ).not.toBeInTheDocument();
  });

  it("tracks x-raying a segment from its sidebar", async () => {
    const { trackSimpleEvent } = setup({
      initialRoute: `/reference/segments/${ORDERS_SEGMENT.id}`,
    });

    const xrayLink = await screen.findByRole("link", {
      name: /X-ray this segment/,
    });
    expect(xrayLink).toHaveAttribute(
      "href",
      `/auto/dashboard/segment/${ORDERS_SEGMENT.id}`,
    );
    await userEvent.click(xrayLink);

    expect(await screen.findByText("X-ray dashboard")).toBeInTheDocument();
    expect(trackSimpleEvent).toHaveBeenCalledTimes(1);
    expect(trackSimpleEvent).toHaveBeenCalledWith({
      event: "x-ray_clicked",
      event_detail: "segment",
      triggered_from: "data_reference",
    });
  });
});
