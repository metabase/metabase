import userEvent from "@testing-library/user-event";

import {
  setupCardDataset,
  setupTablePublishingInfoEndpoint,
} from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import {
  PUBLISHED_ORDERS_URL,
  createOrdersMeasure,
  getRequestAggregations,
  setupMeasurePages,
} from "metabase/data-studio/measures/tests/setup";
import { IsAdmin } from "metabase/route-guards";
import { Route } from "metabase/router";
import { ORDERS, ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getDataStudioTableRoutes } from "../routes";

type SetupOpts = Omit<
  Parameters<typeof setupMeasurePages>[0],
  "routes" | "initialRoute" | "isPublished"
> & { initialRoute: string };

function setup(opts: SetupOpts) {
  return setupMeasurePages({
    ...opts,
    isPublished: true,
    routes: (
      <Route path="data-studio/library">
        {getDataStudioTableRoutes(IsAdmin)}
      </Route>
    ),
  });
}

const KEPT_MEASURE = createOrdersMeasure({ id: 1, name: "Kept Measure" });
const TOTAL_REVENUE = createOrdersMeasure({ id: 3, name: "Total Revenue" });

describe("measures of a published table", () => {
  afterEach(async () => {
    await waitForRequestsToSettle();
  });

  it("opens a measure from the list", async () => {
    const { getPathname } = setup({
      measures: [KEPT_MEASURE, TOTAL_REVENUE],
      initialRoute: `${PUBLISHED_ORDERS_URL}/measures`,
    });

    await userEvent.click(await screen.findByText("Total Revenue"));

    await waitFor(() =>
      expect(getPathname()).toBe(`${PUBLISHED_ORDERS_URL}/measures/3`),
    );
    expect(
      await screen.findByDisplayValue("Total Revenue"),
    ).toBeInTheDocument();
  });

  it("switches between the Overview, Fields and Measures tabs", async () => {
    setupCardDataset();
    setupTablePublishingInfoEndpoint(ORDERS_ID, null);
    const { getPathname } = setup({
      measures: [TOTAL_REVENUE],
      initialRoute: PUBLISHED_ORDERS_URL,
    });

    const header = await screen.findByTestId("table-pane-header");
    expect(
      await within(header).findByRole("tab", { name: "Overview" }),
    ).toBeInTheDocument();
    expect(
      within(header).getByRole("tab", { name: "Fields" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(header).getByRole("tab", { name: "Measures" }),
    );
    await waitFor(() =>
      expect(getPathname()).toBe(`${PUBLISHED_ORDERS_URL}/measures`),
    );
    expect(await screen.findByText("Total Revenue")).toBeInTheDocument();

    await userEvent.click(
      within(await screen.findByTestId("table-pane-header")).getByRole("tab", {
        name: "Overview",
      }),
    );
    await waitFor(() => expect(getPathname()).toBe(PUBLISHED_ORDERS_URL));
  });

  it("creates a measure and opens it", async () => {
    const { getPathname, server } = setup({
      initialRoute: `${PUBLISHED_ORDERS_URL}/measures`,
    });

    expect(await screen.findByText("No measures yet")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /New measure/ }));
    await waitFor(() =>
      expect(getPathname()).toBe(`${PUBLISHED_ORDERS_URL}/measures/new`),
    );

    await userEvent.type(
      await screen.findByPlaceholderText("New measure"),
      "Total Revenue",
    );
    await userEvent.click(
      await screen.findByText("Pick an aggregation function"),
    );
    await userEvent.click(await screen.findByText("Sum of ..."));
    await userEvent.click(await screen.findByText("Total"));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByTestId("toast-undo")).toHaveTextContent(
      "Measure created",
    );
    await waitFor(() =>
      expect(getPathname()).toBe(`${PUBLISHED_ORDERS_URL}/measures/100`),
    );
    expect(server.creates).toEqual([
      expect.objectContaining({ name: "Total Revenue" }),
    ]);
    expect(getRequestAggregations(server.creates[0])).toEqual([
      ["sum", expect.anything(), ["field", expect.anything(), ORDERS.TOTAL]],
    ]);
  });

  it("shows collection breadcrumbs and goes back to the measures list", async () => {
    const { getPathname } = setup({
      measures: [KEPT_MEASURE, TOTAL_REVENUE],
      initialRoute: `${PUBLISHED_ORDERS_URL}/measures/3`,
    });

    const header = await screen.findByTestId("measure-pane-header");
    expect(
      await within(header).findByRole("link", { name: "Data" }),
    ).toBeInTheDocument();
    await userEvent.click(within(header).getByRole("link", { name: "Orders" }));

    await waitFor(() =>
      expect(getPathname()).toBe(`${PUBLISHED_ORDERS_URL}/measures`),
    );
    expect(await screen.findByText("Kept Measure")).toBeInTheDocument();
  });

  it("removes a measure and goes back to the measures list", async () => {
    const { getPathname, server } = setup({
      measures: [KEPT_MEASURE, TOTAL_REVENUE],
      initialRoute: `${PUBLISHED_ORDERS_URL}/measures/3`,
    });

    await screen.findByDisplayValue("Total Revenue");
    await userEvent.click(
      screen.getByRole("button", { name: "Measure actions" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /Remove measure/ }),
    );
    const modal = await screen.findByRole("dialog");
    await userEvent.click(
      within(modal).getByRole("button", { name: "Remove" }),
    );

    expect(await screen.findByTestId("toast-undo")).toHaveTextContent(
      "Measure removed",
    );
    expect(server.updates).toEqual([
      {
        id: 3,
        body: { archived: true, revision_message: "Removed from Data Studio" },
      },
    ]);
    await waitFor(() =>
      expect(getPathname()).toBe(`${PUBLISHED_ORDERS_URL}/measures`),
    );
    expect(await screen.findByText("Kept Measure")).toBeInTheDocument();
    expect(screen.queryByText("Total Revenue")).not.toBeInTheDocument();
  });
});
