import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupLastDownloadFormatEndpoints,
  setupPublicCardGoalValuesEndpoint,
} from "__support__/server-mocks";
import { screen, waitForLoaderToBeRemoved } from "__support__/ui";
import {
  createMockParameter,
  createMockReferencedEntitiesResults,
} from "metabase-types/api/mocks";
import { PRODUCTS } from "metabase-types/api/mocks/presets";

import { type SetupOpts, setup } from "./setup";

const FAKE_UUID = "123456";

const QUESTION_NAME = "Public question";

function setupCommon(opts?: Partial<SetupOpts>) {
  return setup({
    ...opts,
    questionName: QUESTION_NAME,
    uuid: FAKE_UUID,
  });
}

describe("PublicOrEmbeddedQuestion", () => {
  beforeEach(() => {
    setupLastDownloadFormatEndpoints();
  });

  it("should render data", async () => {
    await setupCommon();
    expect(await screen.findByText("John W.")).toBeInTheDocument();
  });

  it("should fetch the goal values of a card with dynamic goals and pass them to the visualization", async () => {
    const goalValues = createMockReferencedEntitiesResults({
      column: "total",
      value: 250,
    });
    setupPublicCardGoalValuesEndpoint(FAKE_UUID, goalValues);

    await setupCommon({
      card: {
        display: "gauge",
        visualization_settings: {
          "gauge.segments": [
            {
              min: 0,
              max: { type: "card", id: 9, column: "total" },
              color: "red",
            },
          ],
        },
      },
    });

    expect(await screen.findByTestId("goal-values")).toHaveTextContent(
      JSON.stringify(goalValues),
    );
  });

  it("should not fetch goal values for a card without dynamic goals", async () => {
    setupPublicCardGoalValuesEndpoint(FAKE_UUID, {});

    await setupCommon();

    expect(await screen.findByText("John W.")).toBeInTheDocument();
    expect(
      fetchMock.callHistory.called(
        `path:/api/public/card/${FAKE_UUID}/goal-values`,
      ),
    ).toBe(false);
  });

  it("should update card settings when visualization component changes them (metabase#37429)", async () => {
    await setupCommon();

    await userEvent.click(
      await screen.findByRole("button", {
        name: /update settings/i,
      }),
    );

    await waitForLoaderToBeRemoved();

    expect(screen.getByTestId("settings")).toHaveTextContent(
      JSON.stringify({ foo: "bar" }),
    );
  });

  it("should show the card's parameters and run the query with their values from the URL", async () => {
    const parameter = createMockParameter({
      id: "category-id",
      name: "Category",
      slug: "category",
      type: "string/=",
      target: ["dimension", ["field", PRODUCTS.CATEGORY, null]],
    });
    await setupCommon({
      card: { parameters: [parameter] },
      search: { category: "Gizmo" },
    });

    const widget = await screen.findByTestId("parameter-widget");
    expect(widget).toHaveTextContent("Category");
    expect(widget).toHaveTextContent("Gizmo");

    const queryUrl = fetchMock.callHistory.lastCall(
      `path:/api/public/card/${FAKE_UUID}/query`,
    )?.url;
    const parameters = new URL(String(queryUrl)).searchParams.get("parameters");
    expect(JSON.parse(String(parameters))).toEqual([
      { id: "category-id", value: ["Gizmo"] },
    ]);
  });
});
