import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";
import { setupJestCanvasMock } from "jest-canvas-mock";

import { setupLastDownloadFormatEndpoints } from "__support__/server-mocks";
import { screen, waitFor, within } from "__support__/ui";
import { mockGetBoundingClientRect } from "__support__/utils";
import { registerVisualizations } from "metabase/visualizations/register";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { Card } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
} from "metabase-types/api/mocks";
import {
  ORDERS_ID,
  createOrdersIdDatasetColumn,
} from "metabase-types/api/mocks/presets";

import { setup } from "./test-utils";

registerVisualizations();

const EXPRESSION_NAME = "TEST_EXPRESSION";

const CARD = createMockCard({
  id: 30905,
  name: "30905",
  display: "table",
  enable_embedding: true,
  dataset_query: Lib.toJsQuery(
    Lib.createTestQuery(SAMPLE_PROVIDER, {
      stages: [
        {
          source: { type: "table", id: ORDERS_ID },
          expressions: [
            {
              name: EXPRESSION_NAME,
              value: {
                type: "operator",
                operator: "+",
                args: [
                  { type: "literal", value: 1 },
                  { type: "literal", value: 1 },
                ],
              },
            },
          ],
        },
      ],
    }),
  ),
});

const DATASET = createMockDataset({
  data: createMockDatasetData({
    rows: [
      [1, 2],
      [2, 2],
    ],
    cols: [
      createOrdersIdDatasetColumn(),
      createMockColumn({
        id: undefined,
        table_id: undefined,
        name: EXPRESSION_NAME,
        display_name: EXPRESSION_NAME,
        source: "fields",
        field_ref: ["expression", EXPRESSION_NAME],
        base_type: "type/Integer",
        effective_type: "type/Integer",
      }),
    ],
  }),
  row_count: 2,
});

/**
 * Keeps the card the way the backend does: a PUT stores the body, and later
 * reads return the stored card.
 */
function setupStatefulCard(card: Card) {
  let currentCard = card;
  fetchMock.get(`path:/api/card/${card.id}`, () => currentCard);
  fetchMock.put(`path:/api/card/${card.id}`, (call) => {
    currentCard = {
      ...currentCard,
      ...JSON.parse(String(call.options.body)),
    };
    return currentCard;
  });
}

function getCardUpdates(): Partial<Card>[] {
  return fetchMock.callHistory
    .calls(`path:/api/card/${CARD.id}`, { method: "PUT" })
    .map((call) => JSON.parse(String(call.options.body)));
}

function getHeaderActionPanel() {
  return screen.getByTestId("qb-header-action-panel");
}

async function openExpressionSettingsFromSidebar() {
  await userEvent.click(screen.getByTestId("viz-settings-button"));
  await userEvent.click(
    await screen.findByTestId(`${EXPRESSION_NAME}-settings-button`),
  );
}

async function turnOnMiniBarChart() {
  const toggle = await screen.findByLabelText("Show a mini bar chart");
  expect(toggle).not.toBeChecked();
  await userEvent.click(toggle);
  await waitFor(() =>
    expect(screen.getByLabelText("Show a mini bar chart")).toBeChecked(),
  );
}

async function saveModifiedQuestion() {
  await userEvent.click(
    await within(getHeaderActionPanel()).findByRole("button", {
      name: "Save",
    }),
  );
  const modal = await screen.findByTestId("save-question-modal");
  expect(
    within(modal).getByText(/Replace original question/i),
  ).toBeInTheDocument();
  await userEvent.click(within(modal).getByRole("button", { name: "Save" }));

  await waitFor(() => expect(getCardUpdates()).toHaveLength(1));
  await waitFor(() =>
    expect(screen.queryByTestId("save-question-modal")).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(
      within(getHeaderActionPanel()).queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument(),
  );
}

function getSavedExpressionSettings() {
  const [update] = getCardUpdates();
  return update.visualization_settings?.column_settings?.[
    JSON.stringify(["name", EXPRESSION_NAME])
  ];
}

describe("QueryBuilder > custom column visualization settings", () => {
  mockGetBoundingClientRect({ width: 1000, height: 800 });

  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
    setupStatefulCard(CARD);
  });

  afterEach(() => {
    jest.resetAllMocks();
    setupJestCanvasMock();
  });

  async function setupCard() {
    await setup({ card: CARD, dataset: DATASET });
    expect(
      await screen.findByRole("columnheader", { name: EXPRESSION_NAME }),
    ).toBeInTheDocument();
    expect(
      within(getHeaderActionPanel()).queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  }

  it("should not show 'Save' after saving the mini bar chart setting of a custom column from the sidebar", async () => {
    await setupCard();

    await openExpressionSettingsFromSidebar();
    await turnOnMiniBarChart();
    await saveModifiedQuestion();

    expect(getSavedExpressionSettings()).toEqual({ show_mini_bar: true });
  });

  it("should not show 'Save' after saving the text formatting setting of a custom column", async () => {
    await setupCard();

    await openExpressionSettingsFromSidebar();
    await userEvent.click(
      await screen.findByLabelText("Display as text, link, or image"),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Email link" }),
    );
    expect(await screen.findByDisplayValue("Email link")).toBeInTheDocument();
    await saveModifiedQuestion();

    expect(getSavedExpressionSettings()).toEqual({ view_as: "email_link" });
  });

  it("should not show 'Save' after saving the visualization settings from the custom column header", async () => {
    await setupCard();

    const headerCell = screen.getByRole("columnheader", {
      name: EXPRESSION_NAME,
    });
    await userEvent.click(within(headerCell).getByText(EXPRESSION_NAME));
    const clickActions = await screen.findByTestId("click-actions-view");
    await userEvent.click(
      within(clickActions).getByRole("button", { name: /gear icon/i }),
    );
    expect(
      await screen.findByTestId("column-formatting-settings"),
    ).toBeInTheDocument();
    await turnOnMiniBarChart();
    await saveModifiedQuestion();

    expect(getSavedExpressionSettings()).toEqual({ show_mini_bar: true });
  });
});
