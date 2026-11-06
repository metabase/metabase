import { findRequests } from "__support__/server-mocks";
import { act, screen, waitFor, within } from "__support__/ui";
import { registerVisualizations } from "metabase/visualizations/register";
import type { Card, Database, TemplateTag } from "metabase-types/api";
import {
  createMockCard,
  createMockColumn,
  createMockDataset,
  createMockDatasetData,
  createMockNativeDatasetQuery,
  createMockNativeQuery,
  createMockTemplateTag,
} from "metabase-types/api/mocks";
import {
  PRODUCTS,
  SAMPLE_DB_ID,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { runQuestionQuery } from "../actions";
import { setParameterValue } from "../store/actions";

import { setup } from "./test-utils";

registerVisualizations();

const ROW_COUNT = 5;

const DATASET = createMockDataset({
  row_count: ROW_COUNT,
  data: createMockDatasetData({
    cols: [createMockColumn({ name: "ID", display_name: "ID" })],
    rows: [[1], [2], [3], [4], [5]],
  }),
});

function createNativeCard(templateTag: TemplateTag): Card {
  return createMockCard({
    id: 1,
    name: "Native question",
    dataset_query: createMockNativeDatasetQuery({
      database: SAMPLE_DB_ID,
      native: createMockNativeQuery({
        query: `SELECT * FROM PRODUCTS WHERE {{${templateTag.name}}}`,
        "template-tags": { [templateTag.name]: templateTag },
      }),
    }),
  });
}

type SetupOpts = {
  card: Card;
  database?: Database;
  initialRoute?: string;
};

async function setupNativeQuestion({
  card,
  database,
  initialRoute,
}: SetupOpts) {
  const { store } = await setup({
    card,
    dataset: DATASET,
    database,
    initialRoute,
    echoQueryParameters: true,
  });
  await screen.findByTestId("execution-time");
  return { store };
}

async function getCardQueryParameterValues() {
  const requests = (await findRequests("POST")).filter(({ url }) =>
    url.endsWith("/api/card/1/query"),
  );
  return requests.map(({ body }) => {
    const parameters: unknown[] = body.parameters;
    return parameters.map((parameter) =>
      typeof parameter === "object" && parameter != null && "value" in parameter
        ? parameter.value
        : undefined,
    );
  });
}

function getOverlayRunButton() {
  return within(screen.getByTestId("run-button-overlay")).getByTestId(
    "run-button",
  );
}

function expectResultNotDirty() {
  expect(getOverlayRunButton()).toHaveAccessibleName("Refresh");
  expect(screen.queryByLabelText("Get Answer")).not.toBeInTheDocument();
  expect(screen.getByText(`Showing ${ROW_COUNT} rows`)).toBeInTheDocument();
}

describe("QueryBuilder > native question parameters", () => {
  it("should not make the question dirty when a required variable has a default value (metabase#14302)", async () => {
    await setupNativeQuestion({
      card: createNativeCard(
        createMockTemplateTag({
          id: "price",
          name: "PRICE",
          "display-name": "Price",
          type: "number",
          default: "10",
          required: true,
        }),
      ),
    });

    expect(await getCardQueryParameterValues()).toEqual([[["10"]]]);
    expectResultNotDirty();
    expect(
      within(screen.getByTestId("qb-header")).queryByRole("button", {
        name: "Save",
      }),
    ).not.toBeInTheDocument();
  });

  it("should not show the run overlay after a run with a text variable value (metabase#15981)", async () => {
    const { store } = await setupNativeQuestion({
      card: createNativeCard(
        createMockTemplateTag({
          id: "text_filter",
          name: "text_filter",
          "display-name": "Text filter",
          type: "text",
        }),
      ),
    });
    expectResultNotDirty();

    act(() => {
      store.dispatch(setParameterValue("text_filter", "Gizmo"));
    });
    expect(getOverlayRunButton()).toHaveAccessibleName("Get Answer");

    await act(() => store.dispatch(runQuestionQuery()));
    await waitFor(async () =>
      expect(await getCardQueryParameterValues()).toEqual([
        [null],
        [["Gizmo"]],
      ]),
    );
    expectResultNotDirty();
  });

  describe("empty field filters (metabase#16739)", () => {
    const CATEGORY_TAG = createMockTemplateTag({
      id: "category",
      name: "filter",
      "display-name": "Filter",
      type: "dimension",
      dimension: ["field", PRODUCTS.CATEGORY, null],
      "widget-type": "string/=",
    });

    it("should not show the run overlay", async () => {
      await setupNativeQuestion({ card: createNativeCard(CATEGORY_TAG) });
      expectResultNotDirty();
    });

    it("should not show the run overlay for a user without native query permissions", async () => {
      await setupNativeQuestion({
        card: createNativeCard(CATEGORY_TAG),
        database: createSampleDatabase({ native_permissions: "none" }),
      });

      expectResultNotDirty();
    });

    it("should not show the run overlay for an empty between filter (metabase#70311)", async () => {
      await setupNativeQuestion({
        card: createNativeCard(
          createMockTemplateTag({
            id: "rating",
            name: "filter",
            "display-name": "Filter",
            type: "dimension",
            dimension: ["field", PRODUCTS.RATING, null],
            "widget-type": "number/between",
          }),
        ),
      });
      expectResultNotDirty();
    });
  });
});
