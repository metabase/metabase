import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupMetricDimensionsEndpoints } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import type { ListMetricDimensionsResponse } from "metabase-types/api";
import {
  createMockAddableDimensionGroup,
  createMockMetricDimension,
  createMockMetricDimensionGroup,
} from "metabase-types/api/mocks/metric";

import { MetricDimensions } from "./MetricDimensions";

const METRIC_ID = 1;

const CREATED_AT = createMockMetricDimension({
  id: "created-at",
  display_name: "Created At",
  effective_type: "type/DateTime",
  semantic_type: "type/CreationTimestamp",
});

const COUNTRY = createMockMetricDimension({
  id: "country",
  display_name: "Country",
  effective_type: "type/Text",
  semantic_type: "type/Country",
});

const BILLED_AT = createMockMetricDimension({
  id: "billed-at",
  display_name: "Billed At",
  effective_type: "type/DateTime",
  semantic_type: null,
});

const ADDABLE_GROUP = createMockAddableDimensionGroup({
  group: createMockMetricDimensionGroup({
    id: "fk",
    type: "connection",
    display_name: "Some FK-linked table",
  }),
  dimensions: [BILLED_AT],
});

function setup(response?: Partial<ListMetricDimensionsResponse>) {
  const fullResponse: ListMetricDimensionsResponse = {
    added: [CREATED_AT, COUNTRY],
    addable: [ADDABLE_GROUP],
    ...response,
  };
  setupMetricDimensionsEndpoints(METRIC_ID, fullResponse);
  renderWithProviders(<MetricDimensions metricId={METRIC_ID} />);
}

function getListPanel() {
  return within(screen.getByTestId("metric-dimension-list"));
}

async function getPostBody(path: string) {
  const calls = fetchMock.callHistory.calls(path, { method: "POST" });
  expect(calls).toHaveLength(1);
  const body = calls[0].options?.body;
  if (typeof body !== "string") {
    throw new Error("expected a string request body");
  }
  return JSON.parse(body);
}

describe("MetricDimensions", () => {
  it("renders the list of added dimensions", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(getListPanel().getByText("Created At")).toBeInTheDocument();
    expect(getListPanel().getByText("Country")).toBeInTheDocument();
    expect(
      screen.getByText("Add, remove, edit, or reorder dimensions"),
    ).toBeInTheDocument();
  });

  it("shows no detail panel until the user acts", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(
      screen.queryByTestId("add-dimensions-panel"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("dimension-settings-panel"),
    ).not.toBeInTheDocument();
  });

  it("removes selected dimensions", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      getListPanel().getByRole("checkbox", { name: "Created At" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(async () => {
      expect(
        await getPostBody(`path:/api/metric/${METRIC_ID}/dimension/remove`),
      ).toEqual({ dimension_ids: ["created-at"] });
    });
  });

  it("adds a dimension from the addable list", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    const addPanel = within(await screen.findByTestId("add-dimensions-panel"));
    expect(addPanel.getByText("Add more dimensions")).toBeInTheDocument();
    expect(
      await addPanel.findByText("Some FK-linked table"),
    ).toBeInTheDocument();

    await userEvent.click(
      await addPanel.findByRole("button", { name: /Billed At/ }),
    );

    await waitFor(async () => {
      expect(
        await getPostBody(`path:/api/metric/${METRIC_ID}/dimension/add`),
      ).toEqual({ dimensions: [BILLED_AT] });
    });
  });

  it("edits a dimension's display name", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      getListPanel().getByRole("button", { name: /Created At/ }),
    );

    const settings = within(
      await screen.findByTestId("dimension-settings-panel"),
    );
    expect(settings.getByText("Settings for Created At")).toBeInTheDocument();

    const nameInput = settings.getByLabelText("Display name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Creation date");
    await userEvent.tab();

    await waitFor(async () => {
      const body = await getPostBody(
        `path:/api/metric/${METRIC_ID}/dimension/created-at`,
      );
      expect(body.display_name).toBe("Creation date");
    });
  });

  it("searches the added dimensions", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      getListPanel().getByPlaceholderText("Search…"),
      "Country",
    );

    await waitFor(() => {
      expect(getListPanel().queryByText("Created At")).not.toBeInTheDocument();
    });
    expect(getListPanel().getByText("Country")).toBeInTheDocument();
  });
});
