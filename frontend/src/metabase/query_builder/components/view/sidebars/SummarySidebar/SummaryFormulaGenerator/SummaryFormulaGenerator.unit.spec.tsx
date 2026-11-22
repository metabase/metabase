import { EditorView } from "@codemirror/view";
import userEvent from "@testing-library/user-event";
import fetchMock, { type RouteResponse } from "fetch-mock";
import { useState } from "react";

import {
  setupDatabaseEndpoints,
  setupGenerateCustomExpressionEndpoint,
  setupUserMetabotPermissionsEndpoint,
} from "__support__/server-mocks";
import { mockSettings } from "__support__/settings";
import {
  act,
  fireEvent,
  renderWithProviders,
  screen,
  waitFor,
  within,
} from "__support__/ui";
import { databaseApi } from "metabase/api";
import { defer } from "metabase/utils/promise";
import * as Lib from "metabase-lib";
import { DEFAULT_TEST_QUERY, SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type {
  GenerateCustomExpressionResponse,
  UserMetabotPermissionsResponse,
} from "metabase-types/api";
import { createMockUserMetabotPermissions } from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import {
  FormulaBarSlotProvider,
  FormulaBarSlotTarget,
} from "../../../FormulaBar";
import { SummarySidebar } from "../SummarySidebar";
import type { SummaryWellId } from "../types";
import { getDimensionItems, getValueItems } from "../utils";

import { MAX_FORMULA_PROMPT_LENGTH } from "./utils";

jest.unmock("@uiw/react-codemirror");

const GENERATE_ROUTE = "path:/api/metabot/custom-expression/generate";
const PERMISSIONS_ROUTE = "path:/api/metabot/permissions/user-permissions";
const PERMISSIONS_ROUTE_NAME = "metabot-user-permissions";

type SetupOpts = {
  hasNlqAccess?: boolean;
  isMetabotConfigured?: boolean;
  isMiniModelConfigured?: boolean;
  permissionsResponse?: Promise<UserMetabotPermissionsResponse>;
  response?: RouteResponse;
  initialQuery?: Lib.Query;
};

async function setup({
  hasNlqAccess = true,
  isMetabotConfigured = true,
  isMiniModelConfigured = true,
  permissionsResponse,
  response,
  initialQuery = Lib.createTestQuery(SAMPLE_PROVIDER, DEFAULT_TEST_QUERY),
}: SetupOpts = {}) {
  const database = createSampleDatabase();
  setupDatabaseEndpoints(database);
  setupUserMetabotPermissionsEndpoint(
    createMockUserMetabotPermissions({
      "metabot-nlq": hasNlqAccess ? "yes" : "no",
    }),
  );
  if (permissionsResponse) {
    fetchMock.removeRoute(PERMISSIONS_ROUTE_NAME);
    fetchMock.get(PERMISSIONS_ROUTE, permissionsResponse, {
      name: PERMISSIONS_ROUTE_NAME,
    });
  }
  setupGenerateCustomExpressionEndpoint(response);
  const onQueryChange = jest.fn<void, [Lib.Query]>();

  function Harness() {
    const [query, setQuery] = useState(initialQuery);
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    return (
      <FormulaBarSlotProvider>
        <FormulaBarSlotTarget />
        <button onClick={() => setIsSidebarOpen(false)}>Close sidebar</button>
        {isSidebarOpen && (
          <SummarySidebar
            query={query}
            stageIndex={-1}
            onQueryChange={(nextQuery) => {
              setQuery(nextQuery);
              onQueryChange(nextQuery);
            }}
          />
        )}
      </FormulaBarSlotProvider>
    );
  }

  const { store } = renderWithProviders(<Harness />, {
    storeInitialState: {
      settings: mockSettings({
        "metabot-enabled?": true,
        "llm-metabot-configured?": isMetabotConfigured,
        "llm-mini-model-configured?": isMiniModelConfigured,
      }),
    },
  });
  await act(async () => {
    await store
      .dispatch(databaseApi.endpoints.getDatabase.initiate({ id: database.id }))
      .unwrap();
  });

  function getLastQuery() {
    const [lastCall] = onQueryChange.mock.calls.slice(-1);
    const [query] = lastCall;
    return {
      values: getValueItems(query, -1).map(({ label }) => label),
      dimensions: getDimensionItems(query, -1).map(({ label }) => label),
      expressions: Lib.expressions(query, -1).map(
        (expression) => Lib.displayInfo(query, -1, expression).displayName,
      ),
    };
  }

  return { onQueryChange, getLastQuery };
}

function getInput(wellId: SummaryWellId) {
  return screen.getByRole("textbox", {
    name:
      wellId === "values" ? "Add a value by name" : "Add a grouping by name",
  });
}

function findGenerateOption(prompt: string) {
  return screen.findByRole("option", {
    name: new RegExp(`Generate “${prompt}”`),
  });
}

async function getLastRequestBody(): Promise<unknown> {
  const body = fetchMock.callHistory.lastCall(GENERATE_ROUTE)?.options.body;
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

describe("summary formula generator", () => {
  it("adds a generated aggregation to Summarize by under its name", async () => {
    const { getLastQuery } = await setup({
      response: {
        expression: "Average([Total])",
        name: "Average total",
      } satisfies GenerateCustomExpressionResponse,
    });

    await userEvent.type(getInput("values"), "revenue per customer");
    await userEvent.click(await findGenerateOption("revenue per customer"));

    await waitFor(() =>
      expect(getLastQuery().values).toEqual(["Average total"]),
    );
    expect(await getLastRequestBody()).toMatchObject({
      mode: "aggregation",
      prompt: "revenue per customer",
      table_name: "Orders",
      columns: expect.arrayContaining([{ name: "[Total]", type: "number" }]),
    });
    expect(getInput("values")).toHaveValue("");
  });

  it("adds a generated custom column to Group by, with Count", async () => {
    const { getLastQuery } = await setup({
      response: {
        expression: 'datetimeAdd([Created At], 1, "day")',
        name: "Next day",
      } satisfies GenerateCustomExpressionResponse,
    });

    await userEvent.type(getInput("columns"), "the day after the order");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(getLastQuery()).toEqual({
        values: ["Count"],
        dimensions: ["Next day: Month"],
        expressions: ["Next day"],
      }),
    );
    expect(await getLastRequestBody()).toMatchObject({
      mode: "expression",
      metrics: [],
      measures: [],
    });
  });

  it("shows the generation in progress and keeps the text until it's done", async () => {
    const response = defer<GenerateCustomExpressionResponse>();
    const { getLastQuery } = await setup({ response: response.promise });

    await userEvent.type(getInput("values"), "revenue per customer");
    await userEvent.keyboard("{Enter}");

    expect(
      await screen.findByRole("option", {
        name: /Generating “revenue per customer”…/,
      }),
    ).toBeInTheDocument();
    expect(getInput("values")).toHaveAttribute("readonly");

    response.resolve({ expression: "Average([Total])", name: "Average total" });
    await waitFor(() =>
      expect(getLastQuery().values).toEqual(["Average total"]),
    );
  });

  it("ignores another request from the same well while one is in flight", async () => {
    const response = defer<GenerateCustomExpressionResponse>();
    const { onQueryChange, getLastQuery } = await setup({
      response: response.promise,
    });

    await userEvent.type(getInput("values"), "revenue per customer");
    await userEvent.keyboard("{Enter}");
    const option = await screen.findByRole("option", {
      name: /Generating “revenue per customer”…/,
    });
    await userEvent.keyboard("{Enter}");
    await userEvent.click(option);
    await userEvent.type(getInput("values"), " and more");

    expect(getInput("values")).toHaveValue("revenue per customer");
    expect(fetchMock.callHistory.calls(GENERATE_ROUTE)).toHaveLength(1);

    response.resolve({ expression: "Average([Total])", name: "Average total" });
    await waitFor(() =>
      expect(getLastQuery().values).toEqual(["Average total"]),
    );
    expect(fetchMock.callHistory.calls(GENERATE_ROUTE)).toHaveLength(1);
    expect(onQueryChange).toHaveBeenCalledTimes(1);
  });

  it("adds formulas from both wells when their requests overlap", async () => {
    const valuesResponse = defer<GenerateCustomExpressionResponse>();
    const columnsResponse = defer<GenerateCustomExpressionResponse>();
    const responses = [valuesResponse.promise, columnsResponse.promise];
    const { getLastQuery } = await setup({
      response: () => responses.shift() ?? Promise.reject(),
    });

    await userEvent.type(getInput("values"), "revenue per customer");
    await userEvent.keyboard("{Enter}");
    await userEvent.type(getInput("columns"), "the day after the order");
    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(fetchMock.callHistory.calls(GENERATE_ROUTE)).toHaveLength(2),
    );

    columnsResponse.resolve({
      expression: 'datetimeAdd([Created At], 1, "day")',
      name: "Next day",
    });
    await waitFor(() =>
      expect(getLastQuery().dimensions).toEqual(["Next day: Month"]),
    );
    expect(
      screen.getByRole("option", {
        name: /Generating “revenue per customer”…/,
      }),
    ).toBeInTheDocument();

    valuesResponse.resolve({
      expression: "Average([Total])",
      name: "Average total",
    });
    await waitFor(() =>
      expect(getLastQuery()).toEqual({
        values: ["Count", "Average total"],
        dimensions: ["Next day: Month"],
        expressions: ["Next day"],
      }),
    );
  });

  it("doesn't change the query when the sidebar closes before the formula is generated", async () => {
    const response = defer<GenerateCustomExpressionResponse>();
    const { onQueryChange } = await setup({ response: response.promise });

    await userEvent.type(getInput("values"), "revenue per customer");
    await userEvent.keyboard("{Enter}");
    expect(
      await screen.findByRole("option", {
        name: /Generating “revenue per customer”…/,
      }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Close sidebar" }),
    );
    expect(screen.queryByTestId("summary-sidebar")).not.toBeInTheDocument();

    await act(async () => {
      response.resolve({
        expression: "Average([Total])",
        name: "Average total",
      });
      await response.promise;
    });

    expect(onQueryChange).not.toHaveBeenCalled();
    expect(screen.queryByTestId("formula-editor")).not.toBeInTheDocument();
  });

  it("shows an API error and retries with Enter", async () => {
    const { onQueryChange } = await setup({
      response: {
        status: 422,
        body: { message: "Couldn't find a formula for that." },
      },
    });

    await userEvent.type(getInput("values"), "something odd");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't find a formula for that.",
    );
    expect(getInput("values")).toHaveValue("something odd");

    await userEvent.keyboard("{Enter}");
    await waitFor(() =>
      expect(fetchMock.callHistory.calls(GENERATE_ROUTE)).toHaveLength(2),
    );
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("truncates a long error page from a proxy", async () => {
    const errorPage = `<html><body><h1>502 Bad Gateway</h1>${"<p>nginx</p>".repeat(100)}</body></html>`;
    await setup({
      response: {
        status: 502,
        headers: { "Content-Type": "text/html" },
        body: errorPage,
      },
    });

    await userEvent.type(getInput("values"), "revenue per customer");
    await userEvent.keyboard("{Enter}");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/^<html><body><h1>502 Bad Gateway<\/h1>/);
    expect(alert.textContent).toHaveLength(201);
    expect(alert.textContent?.endsWith("…")).toBe(true);
  });

  it("explains why AI generation isn't available instead of sending the request", async () => {
    const { onQueryChange } = await setup({
      initialQuery: Lib.createTestQuery(SAMPLE_PROVIDER, {
        stages: [
          {
            source: { type: "table", id: ORDERS_ID },
            expressions: [
              { name: "a".repeat(300), value: { type: "literal", value: 1 } },
            ],
          },
        ],
      }),
    });

    await userEvent.type(getInput("values"), "revenue per customer");
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI generation isn't available because a column name is longer than 256 characters.",
    );
    expect(fetchMock.callHistory.calls(GENERATE_ROUTE)).toHaveLength(0);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("accepts a prompt longer than the limit but explains why it can't be generated", async () => {
    const { onQueryChange } = await setup();
    const prompt = "a".repeat(MAX_FORMULA_PROMPT_LENGTH + 10);

    await userEvent.click(getInput("values"));
    await userEvent.paste(prompt);
    expect(getInput("values")).toHaveValue(prompt);
    expect(await findGenerateOption(prompt)).toBeInTheDocument();
    await userEvent.keyboard("{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "AI generation isn't available because the description is longer than 500 characters.",
    );
    expect(fetchMock.callHistory.calls(GENERATE_ROUTE)).toHaveLength(0);
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("opens a formula that doesn't compile in the formula bar", async () => {
    const { onQueryChange } = await setup({
      response: {
        expression: "Average([Unknown column])",
        name: "Average unknown",
      } satisfies GenerateCustomExpressionResponse,
    });

    await userEvent.type(getInput("values"), "average of something");
    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(
        EditorView.findFromDOM(
          screen.getByTestId("formula-editor"),
        )?.state.doc.toString(),
      ).toBe("Average([Unknown column])"),
    );
    expect(getInput("values")).toHaveValue("");
    expect(onQueryChange).not.toHaveBeenCalled();
  });

  it("keeps the generated name for a formula that doesn't compile while it's fixed", async () => {
    const { getLastQuery } = await setup({
      response: {
        expression: "Average([Unknown column])",
        name: "Average unknown",
      } satisfies GenerateCustomExpressionResponse,
    });

    await userEvent.type(getInput("values"), "average of something");
    await userEvent.keyboard("{Enter}");

    const chip = await screen.findByTestId("summary-well-draft-formula");
    expect(chip).toHaveTextContent("Average unknown");
    const view = EditorView.findFromDOM(screen.getByTestId("formula-editor"));
    expect(view).not.toBeNull();
    await act(async () => {
      view?.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "Average([Total])",
        },
        userEvent: "input.type",
      });
    });
    expect(chip).toHaveTextContent("Average unknown");

    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(getLastQuery().values).toEqual(["Average unknown"]),
    );
  });

  it("waits for AI permissions to load", async () => {
    const permissions = defer<UserMetabotPermissionsResponse>();
    await setup({ permissionsResponse: permissions.promise });

    await userEvent.type(getInput("values"), "revenue per customer");

    expect(await screen.findByLabelText("Loading…")).toBeInTheDocument();
    expect(
      screen.queryByText("No matching metrics or columns"),
    ).not.toBeInTheDocument();

    permissions.resolve(createMockUserMetabotPermissions());

    expect(
      await findGenerateOption("revenue per customer"),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Loading…")).not.toBeInTheDocument();
    expect(
      screen.queryByText("No matching metrics or columns"),
    ).not.toBeInTheDocument();
  });

  it("generates a formula with Enter once AI permissions load", async () => {
    const permissions = defer<UserMetabotPermissionsResponse>();
    const { getLastQuery } = await setup({
      permissionsResponse: permissions.promise,
    });

    await userEvent.type(getInput("values"), "revenue per customer");
    expect(await screen.findByLabelText("Loading…")).toBeInTheDocument();

    permissions.resolve(createMockUserMetabotPermissions());
    expect(await findGenerateOption("revenue per customer")).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.keyboard("{Enter}");

    await waitFor(() =>
      expect(getLastQuery().values).toEqual(["Average total"]),
    );
  });

  it("doesn't offer to generate a formula for text starting with = after spaces", async () => {
    await setup();

    await userEvent.type(getInput("values"), "  =revenue");

    expect(
      await screen.findByText("No matching metrics or columns"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Generate/ }),
    ).not.toBeInTheDocument();
  });

  it("doesn't offer to generate a formula without permission to use AI", async () => {
    await setup({ hasNlqAccess: false });

    await userEvent.type(getInput("values"), "revenue per customer");

    expect(
      await screen.findByText("No matching metrics or columns"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Generate/ }),
    ).not.toBeInTheDocument();
  });

  it("doesn't offer to generate a formula when the mini model's connection isn't configured", async () => {
    await setup({ isMiniModelConfigured: false });

    await userEvent.type(getInput("values"), "revenue per customer");

    expect(
      await screen.findByText("No matching metrics or columns"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Generate/ }),
    ).not.toBeInTheDocument();
  });

  it("offers to generate a formula when only the mini model's connection is configured", async () => {
    await setup({ isMetabotConfigured: false });

    await userEvent.type(getInput("values"), "revenue per customer");

    expect(
      await findGenerateOption("revenue per customer"),
    ).toBeInTheDocument();
  });

  it("doesn't offer to generate a formula for text that matches a column", async () => {
    await setup();

    await userEvent.type(getInput("columns"), "Created");

    const options = await screen.findAllByRole("option");
    expect(options.length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("option", { name: /Generate/ }),
    ).not.toBeInTheDocument();
  });

  it("checks AI permissions when the sidebar opens", async () => {
    await setup();

    await waitFor(() =>
      expect(fetchMock.callHistory.calls(PERMISSIONS_ROUTE)).toHaveLength(1),
    );

    await userEvent.type(getInput("columns"), "Created tomorrow");
    expect(await findGenerateOption("Created tomorrow")).toBeInTheDocument();
    expect(fetchMock.callHistory.calls(PERMISSIONS_ROUTE)).toHaveLength(1);
  });

  it("opens a formula starting with = in the formula bar instead of generating one", async () => {
    await setup();

    fireEvent.change(getInput("values"), { target: { value: "=nothing" } });

    expect(
      await screen.findByRole("textbox", { name: "Formula" }),
    ).toBeInTheDocument();
    expect(
      within(document.body).queryByRole("option", { name: /Generate/ }),
    ).not.toBeInTheDocument();
  });
});
