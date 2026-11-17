import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupDatabaseEndpoints,
  setupDatabaseMetadataEndpoint,
  setupSegmentsEndpoints,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import { createMockState } from "__support__/state";
import { renderRoutes, screen, waitFor, within } from "__support__/ui";
import * as Analytics from "metabase/analytics";
import type { RouteObject } from "metabase/router";
import { createMockSegment, createMockUser } from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  PEOPLE_ID,
  SAMPLE_DB_ID,
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

// A row of the field list, found by the column name its display name input
// uses as a placeholder.
function getFieldRow(columnName: string) {
  const row = screen
    .getAllByRole("listitem")
    .find((item) => within(item).queryByPlaceholderText(columnName));
  if (row == null) {
    throw new Error(`No row for ${columnName}`);
  }
  return row;
}

function getIdFieldsRequestUrls() {
  return fetchMock.callHistory
    .calls()
    .map((call) => call.url)
    .filter((url) => url.includes("/idfields"));
}

async function expectFkTargetOptions() {
  const listbox = await screen.findByRole("listbox");
  for (const option of [
    "Orders → ID",
    "People → ID",
    "Products → ID",
    "Reviews → ID",
  ]) {
    expect(within(listbox).getByText(option)).toBeVisible();
  }
  return listbox;
}

async function chooseNoSemanticType(input: HTMLElement) {
  await userEvent.click(input);
  await userEvent.click(
    within(await screen.findByRole("listbox")).getByText("No semantic type"),
  );
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

  it("changes the FK target and the semantic type of segment fields in the list and the detail view (metabase#55617, metabase#55618)", async () => {
    setup({ initialRoute: "/reference/segments" });

    await userEvent.click(
      await screen.findByRole("link", {
        name: new RegExp(ORDERS_SEGMENT.name),
      }),
    );
    await userEvent.click(
      await screen.findByRole("link", { name: /Fields in this segment/ }),
    );
    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));

    // metabase#55618
    expect(
      await screen.findAllByPlaceholderText("Select a target"),
    ).toHaveLength(2);
    const userIdTarget = within(getFieldRow("USER_ID")).getByPlaceholderText(
      "Select a target",
    );
    expect(userIdTarget).toHaveValue("People → ID");
    expect(
      within(getFieldRow("PRODUCT_ID")).getByPlaceholderText("Select a target"),
    ).toHaveValue("Products → ID");
    expect(getIdFieldsRequestUrls()).not.toHaveLength(0);
    for (const url of getIdFieldsRequestUrls()) {
      expect(new URL(url).pathname).toBe(
        `/api/database/${SAMPLE_DB_ID}/idfields`,
      );
    }

    await userEvent.click(userIdTarget);
    const listbox = await expectFkTargetOptions();
    await userEvent.click(within(listbox).getByText("Reviews → ID"));

    await waitFor(() =>
      expect(
        within(getFieldRow("USER_ID")).getByPlaceholderText("Select a target"),
      ).toHaveValue("Reviews → ID"),
    );
    expect(
      within(getFieldRow("PRODUCT_ID")).getByPlaceholderText("Select a target"),
    ).toHaveValue("Products → ID");

    // metabase#55617
    const discountType = within(getFieldRow("DISCOUNT")).getByPlaceholderText(
      "Select a semantic type",
    );
    expect(
      screen
        .getAllByPlaceholderText("Select a semantic type")
        .indexOf(discountType),
    ).toBeGreaterThan(0);
    expect(discountType).toHaveValue("Discount");
    await chooseNoSemanticType(discountType);
    await waitFor(() =>
      expect(
        within(getFieldRow("DISCOUNT")).getByPlaceholderText(
          "Select a semantic type",
        ),
      ).toHaveValue("No semantic type"),
    );

    // field detail view
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(await screen.findByRole("link", { name: /User ID/ }));

    // metabase#55618
    await userEvent.click(await screen.findByRole("button", { name: /Edit/ }));
    const targetInput = await screen.findByPlaceholderText("Select a target");
    expect(targetInput).toHaveValue("People → ID");
    await userEvent.click(targetInput);
    const detailListbox = await expectFkTargetOptions();
    await userEvent.click(within(detailListbox).getByText("Reviews → ID"));
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Select a target")).toHaveValue(
        "Reviews → ID",
      ),
    );

    // metabase#55617
    const fieldType = screen.getByPlaceholderText("Select a semantic type");
    expect(fieldType).toHaveValue("Foreign Key");
    await chooseNoSemanticType(fieldType);
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Select a semantic type")).toHaveValue(
        "No semantic type",
      ),
    );
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
