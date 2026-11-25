import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupMeasureEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import { Route } from "metabase/router";

import {
  COUNT_DEFINITION,
  ORDERS_ID,
  TOTAL_MEASURE,
  TOTAL_MEASURE_ID,
  createOrdersMeasure,
  enterCustomExpression,
  getAggregationFromBody,
  setupEnterpriseMeasureState,
  setupMeasureMetadata,
} from "../../test-utils";

import { PublishedTableMeasureDetailPage } from "./PublishedTableMeasureDetailPage";

const TABLE_MEASURE = createOrdersMeasure({
  id: 41,
  name: "Table Measure",
  definition: COUNT_DEFINITION,
});

function referencesMeasure(value: unknown, measureId: number): boolean {
  if (!Array.isArray(value)) {
    return false;
  }
  return (
    (value[0] === "measure" && value[2] === measureId) ||
    value.some((item) => referencesMeasure(item, measureId))
  );
}

function setup() {
  setupMeasureMetadata({ measures: [TOTAL_MEASURE, TABLE_MEASURE] });
  setupMeasureEndpoint(TABLE_MEASURE);
  // The backend refuses a measure that references itself.
  fetchMock.put(`path:/api/measure/${TABLE_MEASURE.id}`, ({ options }) => {
    const body: unknown = JSON.parse(String(options.body));
    return referencesMeasure(getAggregationFromBody(body), TABLE_MEASURE.id)
      ? { status: 400, body: { message: "Measure cycle detected" } }
      : { ...TABLE_MEASURE, ...Object(body) };
  });

  renderWithProviders(
    <Route
      path="/data-studio/library/tables/:tableId/measures/:measureId"
      element={<PublishedTableMeasureDetailPage />}
    />,
    {
      withRouter: true,
      withUndos: true,
      initialRoute: `/data-studio/library/tables/${ORDERS_ID}/measures/${TABLE_MEASURE.id}`,
      storeInitialState: setupEnterpriseMeasureState(),
    },
  );
}

async function replaceDefinition(formula: string) {
  await userEvent.click(await screen.findByText("Count"));
  await userEvent.click(await screen.findByText("Custom Expression"));
  await enterCustomExpression({ formula, button: "Update" });
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
}

function getLastUpdateBody(): unknown {
  const call = fetchMock.callHistory.lastCall(
    `path:/api/measure/${TABLE_MEASURE.id}`,
    { method: "PUT" },
  );
  return JSON.parse(String(call?.options.body));
}

describe("PublishedTableMeasureDetailPage", () => {
  it("should not be possible to save a measure that references itself", async () => {
    setup();
    await replaceDefinition("[[Table Measure]");

    expect(
      await within(await screen.findByTestId("undo-list")).findByText(
        "Failed to update measure",
      ),
    ).toBeInTheDocument();
    expect(getAggregationFromBody(getLastUpdateBody())).toEqual([
      ["measure", expect.objectContaining({ name: "Count" }), TABLE_MEASURE.id],
    ]);
  });

  it("should save a measure that references another measure", async () => {
    setup();
    await replaceDefinition("[[TotalMeasure]");

    expect(
      await within(await screen.findByTestId("undo-list")).findByText(
        "Measure updated",
      ),
    ).toBeInTheDocument();
    expect(getAggregationFromBody(getLastUpdateBody())).toEqual([
      ["measure", expect.objectContaining({ name: "Count" }), TOTAL_MEASURE_ID],
    ]);
  });
});
