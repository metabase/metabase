import userEvent from "@testing-library/user-event";

import { screen, waitFor, within } from "__support__/ui";
import { waitForRequestsToSettle } from "__support__/utils";
import { getDataStudioMetadataRoutes } from "metabase/data-studio/data-model/routes";
import { IsAdmin } from "metabase/route-guards";
import { Route } from "metabase/router";
import { createMockRevision } from "metabase-types/api/mocks";
import { ORDERS } from "metabase-types/api/mocks/presets";

import {
  DATA_MODEL_ORDERS_URL,
  DATA_MODEL_PRODUCTS_URL,
  createOrdersMeasure,
  getRequestAggregations,
  setupMeasurePages,
} from "./setup";

type SetupOpts = Omit<
  Parameters<typeof setupMeasurePages>[0],
  "routes" | "initialRoute"
> & { initialRoute: string };

function setup(opts: SetupOpts) {
  return setupMeasurePages({
    ...opts,
    routes: (
      <>
        <Route path="data-studio/data">
          {getDataStudioMetadataRoutes(IsAdmin)}
        </Route>
        <Route path="unauthorized" element={<h1>Unauthorized page</h1>} />
      </>
    ),
  });
}

const KEPT_MEASURE = createOrdersMeasure({ id: 1, name: "Kept Measure" });
const TOTAL_REVENUE = createOrdersMeasure({
  id: 2,
  name: "Total Revenue",
  description: "Test description",
});

describe("measures in the data model (enterprise)", () => {
  afterEach(async () => {
    await waitForRequestsToSettle();
  });

  it("opens a measure from the list", async () => {
    const { getPathname } = setup({
      measures: [KEPT_MEASURE, TOTAL_REVENUE],
      initialRoute: `${DATA_MODEL_ORDERS_URL}/measures`,
    });

    const list = await screen.findByTestId("table-measures-page");
    await userEvent.click(
      await within(list).findByRole("listitem", { name: "Total Revenue" }),
    );

    await waitFor(() =>
      expect(getPathname()).toBe(`${DATA_MODEL_ORDERS_URL}/measures/2`),
    );
    expect(
      await screen.findByDisplayValue("Total Revenue"),
    ).toBeInTheDocument();
  });

  describe("new measure", () => {
    it("asks before leaving with unsaved changes", async () => {
      const { getPathname } = setup({
        initialRoute: `${DATA_MODEL_ORDERS_URL}/measures/new`,
      });

      await userEvent.type(
        await screen.findByPlaceholderText("New measure"),
        "Total Revenue",
      );
      await userEvent.click(await findBreadcrumb("Orders"));

      const modal = await screen.findByRole("dialog");
      expect(
        within(modal).getByText("Discard your changes?"),
      ).toBeInTheDocument();
      await userEvent.click(
        within(modal).getByRole("button", { name: "Cancel" }),
      );

      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );
      expect(getPathname()).toBe(`${DATA_MODEL_ORDERS_URL}/measures/new`);
      expect(screen.getByPlaceholderText("New measure")).toHaveValue(
        "Total Revenue",
      );
    });

    it("leaves without asking when nothing changed", async () => {
      const { getPathname } = setup({
        initialRoute: `${DATA_MODEL_ORDERS_URL}/measures/new`,
      });

      await screen.findByPlaceholderText("New measure");
      await userEvent.click(await findBreadcrumb("Orders"));

      await waitFor(() =>
        expect(getPathname()).toBe(`${DATA_MODEL_ORDERS_URL}/measures`),
      );
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });

    it("creates a measure and opens it", async () => {
      const { getPathname, server } = setup({
        measures: [KEPT_MEASURE],
        initialRoute: `${DATA_MODEL_ORDERS_URL}/measures/new`,
      });

      await userEvent.type(
        await screen.findByPlaceholderText("New measure"),
        "Total Revenue",
      );
      await pickAggregation("Sum of ...", ["Total"]);
      expect(await screen.findByText("Sum of Total")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      expect(await findToast()).toHaveTextContent("Measure created");
      await waitFor(() =>
        expect(getPathname()).toBe(`${DATA_MODEL_ORDERS_URL}/measures/101`),
      );
      expect(server.creates).toEqual([
        expect.objectContaining({ name: "Total Revenue" }),
      ]);
      expect(getRequestAggregations(server.creates[0])).toEqual([
        ["sum", expect.anything(), ["field", expect.anything(), ORDERS.TOTAL]],
      ]);
      expect(
        await screen.findByDisplayValue("Total Revenue"),
      ).toBeInTheDocument();
    });

    it("shows Explore in the menu once an aggregation is picked", async () => {
      setup({ initialRoute: `${DATA_MODEL_PRODUCTS_URL}/measures/new` });

      expect(
        await screen.findByText("Pick an aggregation function"),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Measure actions" }),
      ).not.toBeInTheDocument();

      await pickAggregation("Average of ...", ["Price"]);
      expect(await screen.findByText("Average of Price")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Measure actions" }),
      );
      expect(
        await screen.findByRole("menuitem", { name: /Explore/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: /Remove measure/ }),
      ).not.toBeInTheDocument();
    });
  });

  describe("existing measure", () => {
    it("updates the name and the description, and goes back to the measures tab", async () => {
      const { getPathname, server } = setup({
        measures: [KEPT_MEASURE, TOTAL_REVENUE],
        initialRoute: `${DATA_MODEL_ORDERS_URL}/measures/2`,
      });

      const nameInput = await screen.findByDisplayValue("Total Revenue");
      expect(await findDescription()).toHaveTextContent("Test description");

      await userEvent.type(nameInput, " Updated{enter}");
      expect(await findToast()).toHaveTextContent("Measure name updated");
      expect(server.updates).toEqual([
        {
          id: 2,
          body: {
            name: "Total Revenue Updated",
            revision_message: "Updated measure name",
          },
        },
      ]);

      await userEvent.click(await findDescription());
      const descriptionInput = screen.getByPlaceholderText(
        "Only if it really needs it",
      );
      await userEvent.clear(descriptionInput);
      await userEvent.type(descriptionInput, "Updated description");
      await userEvent.click(screen.getByRole("button", { name: "Save" }));

      await waitFor(() =>
        expect(screen.getByTestId("undo-list")).toHaveTextContent(
          "Measure updated",
        ),
      );
      expect(server.updates).toHaveLength(2);
      expect(server.updates[1]).toEqual({
        id: 2,
        body: expect.objectContaining({
          name: "Total Revenue Updated",
          description: "Updated description",
          revision_message: "Updated from Data Studio",
        }),
      });
      expect(getRequestAggregations(server.updates[1].body)).toEqual([
        ["sum", expect.anything(), ["field", expect.anything(), ORDERS.TOTAL]],
      ]);

      await userEvent.click(await findBreadcrumb("Orders"));
      await waitFor(() =>
        expect(getPathname()).toBe(`${DATA_MODEL_ORDERS_URL}/measures`),
      );
      expect(
        await screen.findByRole("tab", { name: "Measures" }),
      ).toHaveAttribute("aria-selected", "true");
      expect(
        await screen.findByRole("listitem", { name: "Total Revenue Updated" }),
      ).toBeInTheDocument();
    });

    it("removes the measure and goes back to the list", async () => {
      const { getPathname, server } = setup({
        measures: [KEPT_MEASURE, TOTAL_REVENUE],
        initialRoute: `${DATA_MODEL_ORDERS_URL}/measures/2`,
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

      expect(await findToast()).toHaveTextContent("Measure removed");
      expect(server.updates).toEqual([
        {
          id: 2,
          body: {
            archived: true,
            revision_message: "Removed from Data Studio",
          },
        },
      ]);
      await waitFor(() =>
        expect(getPathname()).toBe(`${DATA_MODEL_ORDERS_URL}/measures`),
      );
      const list = await screen.findByTestId("table-measures-page");
      expect(
        await within(list).findByRole("listitem", { name: "Kept Measure" }),
      ).toBeInTheDocument();
      expect(
        within(list).queryByRole("listitem", { name: "Total Revenue" }),
      ).not.toBeInTheDocument();
    });

    it("shows the revision history and the dependency graph", async () => {
      const { getPathname } = setup({
        measures: [
          KEPT_MEASURE,
          createOrdersMeasure({ id: 2, name: "Updated Name" }),
        ],
        revisions: {
          1: [createMockRevision({ id: 10, is_creation: true })],
          2: MEASURE_REVISIONS,
        },
        initialRoute: `${DATA_MODEL_ORDERS_URL}/measures/2`,
      });

      await screen.findByDisplayValue("Updated Name");
      await userEvent.click(
        screen.getByRole("tab", { name: /Revision history/ }),
      );

      await waitFor(() =>
        expect(getPathname()).toBe(
          `${DATA_MODEL_ORDERS_URL}/measures/2/revisions`,
        ),
      );
      expect(
        await screen.findByText("changed the aggregation definition"),
      ).toBeInTheDocument();
      expect(screen.getByText("updated the description")).toBeInTheDocument();
      expect(screen.getByText("renamed the measure")).toBeInTheDocument();
      expect(screen.getByText("created this measure")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("tab", { name: /Dependencies/ }));
      await waitFor(() =>
        expect(getPathname()).toBe(
          `${DATA_MODEL_ORDERS_URL}/measures/2/dependencies`,
        ),
      );
      const graph = await screen.findByTestId("dependency-graph");
      expect(
        await within(graph).findByText("Updated Name"),
      ).toBeInTheDocument();
    });
  });

  describe("non-admin users", () => {
    it("are sent to the unauthorized page from the new measure page", async () => {
      const { getPathname } = setup({
        isAdmin: false,
        initialRoute: `${DATA_MODEL_ORDERS_URL}/measures/new`,
      });

      expect(await screen.findByText("Unauthorized page")).toBeInTheDocument();
      expect(getPathname()).toBe("/unauthorized");
    });

    it("see a measure read-only and can open its revision history", async () => {
      setup({
        isAdmin: false,
        measures: [KEPT_MEASURE, TOTAL_REVENUE],
        revisions: { 2: [createMockRevision({ id: 1, is_creation: true })] },
        initialRoute: `${DATA_MODEL_ORDERS_URL}/measures/2`,
      });

      expect(await screen.findByDisplayValue("Total Revenue")).toBeDisabled();
      expect(screen.getByText("Description")).toBeInTheDocument();
      expect(screen.getByText("Test description")).toBeInTheDocument();
      expect(
        screen.queryByLabelText("Give it a description"),
      ).not.toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: "Measure actions" }),
      );
      expect(
        await screen.findByRole("menuitem", { name: /Explore/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("menuitem", { name: /Remove measure/ }),
      ).not.toBeInTheDocument();
      await userEvent.keyboard("{Escape}");

      await userEvent.click(
        screen.getByRole("tab", { name: /Revision history/ }),
      );
      expect(
        await screen.findByText("created this measure"),
      ).toBeInTheDocument();
    });
  });
});

const MEASURE_REVISIONS = [
  createMockRevision({
    id: 4,
    is_creation: false,
    diff: {
      definition: {
        before: { aggregation: [["count"]] },
        after: { aggregation: [["sum", ["field", ORDERS.TOTAL, null]]] },
      },
    },
  }),
  createMockRevision({
    id: 3,
    is_creation: false,
    diff: { description: { before: "Original", after: "Updated" } },
  }),
  createMockRevision({
    id: 2,
    is_creation: false,
    diff: { name: { before: "Original Name", after: "Updated Name" } },
  }),
  createMockRevision({ id: 1, is_creation: true }),
];

async function findBreadcrumb(name: string) {
  const header = await screen.findByTestId("measure-pane-header");
  return within(header).findByRole("link", { name });
}

async function findDescription() {
  return screen.findByLabelText("Give it a description");
}

async function findToast() {
  return screen.findByTestId("toast-undo");
}

async function pickAggregation(operator: string, columnPath: string[]) {
  await userEvent.click(
    await screen.findByText("Pick an aggregation function"),
  );
  await userEvent.click(await screen.findByText(operator));
  for (const column of columnPath) {
    await userEvent.click(await screen.findByText(column));
  }
}
