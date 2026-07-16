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
import { metricApi } from "metabase/api/metric";
import type { ListMetricDimensionsResponse } from "metabase-types/api";
import {
  createMockAddableDimensionGroup,
  createMockMetricDimension,
  createMockMetricDimensionGroup,
} from "metabase-types/api/mocks/metric";

import { MetricDimensions } from "./MetricDimensions";

const METRIC_ID = 1;

const CREATED_AT_ID = "11111111-1111-4111-8111-111111111111";
const COUNTRY_ID = "22222222-2222-4222-8222-222222222222";
const SUSPEND_AT_ID = "33333333-3333-4333-8333-333333333333";

const MAIN_GROUP = createMockMetricDimensionGroup({
  id: "main",
  type: "main",
  display_name: "The main table",
});

const CREATED_AT = createMockMetricDimension({
  id: CREATED_AT_ID,
  display_name: "Created At",
  effective_type: "type/DateTime",
  semantic_type: "type/CreationTimestamp",
  status: "status/active",
  default: true,
  group: MAIN_GROUP,
  sources: [{ type: "field", "field-id": 101 }],
});

const COUNTRY = createMockMetricDimension({
  id: COUNTRY_ID,
  display_name: "Country",
  effective_type: "type/Text",
  semantic_type: "type/Country",
  status: "status/active",
  sources: [{ type: "field", "field-id": 102 }],
});

const SUSPEND_AT = createMockMetricDimension({
  id: SUSPEND_AT_ID,
  display_name: "Suspend At",
  effective_type: "type/DateTime",
  semantic_type: null,
  status: "status/orphaned",
  sources: [{ type: "field", "field-id": 103 }],
});

const BILLED_AT = createMockMetricDimension({
  id: "44444444-4444-4444-8444-444444444444",
  display_name: "Billed At",
  effective_type: "type/DateTime",
  semantic_type: null,
  sources: [{ type: "field", "field-id": 201 }],
});

const PLAN_NAME = createMockMetricDimension({
  id: "55555555-5555-4555-8555-555555555555",
  display_name: "Plan Name",
  effective_type: "type/Text",
  semantic_type: null,
  sources: [{ type: "field", "field-id": 202 }],
});

const ADDABLE_GROUP = createMockAddableDimensionGroup({
  group: createMockMetricDimensionGroup({
    id: "fk",
    type: "connection",
    display_name: "Some FK-linked table",
  }),
  dimensions: [BILLED_AT, PLAN_NAME],
});

const SELF_ADDABLE_COLUMN = createMockMetricDimension({
  id: "66666666-6666-4666-8666-666666666666",
  display_name: "Plan Updated At",
  effective_type: "type/DateTime",
  semantic_type: null,
  sources: [{ type: "field", "field-id": 104 }],
});

const SELF_ADDABLE_GROUP = createMockAddableDimensionGroup({
  group: createMockMetricDimensionGroup({
    id: "main",
    type: "main",
    display_name: "The main table",
  }),
  dimensions: [SELF_ADDABLE_COLUMN],
});

function setup(response?: Partial<ListMetricDimensionsResponse>) {
  const fullResponse: ListMetricDimensionsResponse = {
    added: [CREATED_AT, COUNTRY, SUSPEND_AT],
    addable: [SELF_ADDABLE_GROUP, ADDABLE_GROUP],
    ...response,
  };
  setupMetricDimensionsEndpoints(METRIC_ID, fullResponse);
  const { store } = renderWithProviders(
    <MetricDimensions metricId={METRIC_ID} />,
  );
  return { store };
}

function getListPanel() {
  return within(screen.getByTestId("metric-dimension-list"));
}

function getDimensionRow(name: string) {
  return within(screen.getByTestId(`dimension-row-${name}`));
}

async function openSettings(name: RegExp) {
  await userEvent.click(getListPanel().getByRole("button", { name }));
  return screen.findByTestId("dimension-settings-panel");
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
    expect(screen.getByText("Dimensions of this metric")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Available dimensions" }),
    ).toHaveAttribute("data-variant", "default");
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

  it("marks the default dimension with a badge", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(
      getDimensionRow("Created At").getByText("Default"),
    ).toBeInTheDocument();
    expect(
      getDimensionRow("Country").queryByText("Default"),
    ).not.toBeInTheDocument();
  });

  it("marks orphaned dimensions with a warning", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(
      getDimensionRow("Suspend At").getByLabelText("warning icon"),
    ).toBeInTheDocument();
    expect(
      getDimensionRow("Created At").queryByLabelText("warning icon"),
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
      ).toEqual({ dimension_ids: [CREATED_AT_ID] });
    });
  });

  it("adds a joined-table dimension with a table-prefixed title", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      screen.getByRole("button", { name: "Available dimensions" }),
    );

    const addPanel = within(await screen.findByTestId("add-dimensions-panel"));
    expect(addPanel.getByText("Add available dimensions")).toBeInTheDocument();
    expect(
      await addPanel.findByText("Some FK-linked table"),
    ).toBeInTheDocument();

    await userEvent.click(
      await addPanel.findByRole("button", { name: /Billed At/ }),
    );

    await waitFor(async () => {
      expect(
        await getPostBody(`path:/api/metric/${METRIC_ID}/dimension/add`),
      ).toEqual({
        dimensions: [
          { ...BILLED_AT, display_name: "Some FK-linked table - Billed At" },
        ],
      });
    });
  });

  it("keeps the plain title for a self-table dimension", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      screen.getByRole("button", { name: "Available dimensions" }),
    );

    const addPanel = within(await screen.findByTestId("add-dimensions-panel"));
    await userEvent.click(
      await addPanel.findByRole("button", { name: /Plan Updated At/ }),
    );

    await waitFor(async () => {
      expect(
        await getPostBody(`path:/api/metric/${METRIC_ID}/dimension/add`),
      ).toEqual({ dimensions: [SELF_ADDABLE_COLUMN] });
    });
  });

  it("edits a dimension's display name", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    expect(settings.getByText("Settings for Created At")).toBeInTheDocument();

    const nameInput = settings.getByLabelText("Display name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Creation date");
    await userEvent.tab();

    await waitFor(async () => {
      const body = await getPostBody(
        `path:/api/metric/${METRIC_ID}/dimension/${CREATED_AT_ID}`,
      );
      expect(body.display_name).toBe("Creation date");
    });
  });

  it("sets a dimension as the default", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Country/));
    await userEvent.click(
      settings.getByRole("button", { name: "Set as default" }),
    );

    await waitFor(async () => {
      expect(
        await getPostBody(
          `path:/api/metric/${METRIC_ID}/dimension/set-default`,
        ),
      ).toEqual({ dimension_id: COUNTRY_ID });
    });
  });

  it("does not offer set-default for the current default dimension", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    expect(settings.getByText("Default dimension")).toBeInTheDocument();
    expect(
      settings.queryByRole("button", { name: "Set as default" }),
    ).not.toBeInTheDocument();
  });

  it("does not offer set-default for orphaned dimensions", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Suspend At/));
    expect(
      settings.queryByRole("button", { name: "Set as default" }),
    ).not.toBeInTheDocument();
  });

  it("shows a loading state while setting a default dimension", async () => {
    let resolveSetDefault: (dimensions: (typeof COUNTRY)[]) => void = () => {};
    setup();
    fetchMock.modifyRoute(`metric-${METRIC_ID}-dimensions-set-default`, {
      response: () =>
        new Promise((resolve) => {
          resolveSetDefault = resolve;
        }),
    });
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Country/));
    const button = settings.getByRole("button", { name: "Set as default" });
    await userEvent.click(button);

    await waitFor(() => {
      expect(button).toHaveAttribute("data-loading", "true");
    });
    expect(button).toBeDisabled();

    resolveSetDefault([COUNTRY]);
    await waitFor(() => {
      expect(button).not.toHaveAttribute("data-loading", "true");
    });
  });

  it("shows a loading state while dimensions are being fetched", async () => {
    let resolveDimensions: (
      response: ListMetricDimensionsResponse,
    ) => void = () => {};
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Country/));
    const button = settings.getByRole("button", { name: "Set as default" });
    fetchMock.modifyRoute(`metric-${METRIC_ID}-dimensions-list`, {
      response: () =>
        new Promise((resolve) => {
          resolveDimensions = resolve;
        }),
    });

    await userEvent.type(
      getListPanel().getByPlaceholderText("Search…"),
      "Country",
    );

    await waitFor(() => {
      expect(button).toHaveAttribute("data-loading", "true");
    });
    expect(button).toBeDisabled();

    resolveDimensions({ added: [COUNTRY], addable: [] });
    await waitFor(() => {
      expect(button).not.toHaveAttribute("data-loading", "true");
    });
  });

  it("displays the dimension type", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    const typeField = within(settings.getByTestId("dimension-type"));
    expect(typeField.getByText("Dimension type")).toBeInTheDocument();
    expect(typeField.getByText("Date")).toBeInTheDocument();
  });

  it("displays the source column read-only as table.column", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    const sourceField = within(settings.getByTestId("dimension-source"));

    expect(sourceField.getByText("Source column")).toBeInTheDocument();
    expect(
      sourceField.getByText("The main table.Created At"),
    ).toBeInTheDocument();
    expect(
      settings.queryByRole("textbox", { name: "Source column" }),
    ).not.toBeInTheDocument();
  });

  it("shows a drag handle on every row", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    expect(
      getDimensionRow("Created At").getByLabelText("grabber icon"),
    ).toBeInTheDocument();
    expect(
      getDimensionRow("Country").getByLabelText("grabber icon"),
    ).toBeInTheDocument();
  });

  it("hides drag handles while searching", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.type(
      getListPanel().getByPlaceholderText("Search…"),
      "Country",
    );

    await waitFor(() => {
      expect(getListPanel().queryByText("Created At")).not.toBeInTheDocument();
    });
    expect(
      getDimensionRow("Country").queryByLabelText("grabber icon"),
    ).not.toBeInTheDocument();
  });

  it("reordering posts the new order and reorders the list optimistically", async () => {
    const { store } = setup();
    await waitForLoaderToBeRemoved();

    const newOrder = [COUNTRY_ID, SUSPEND_AT_ID, CREATED_AT_ID];
    store.dispatch(
      metricApi.endpoints.reorderMetricDimensions.initiate({
        metricId: METRIC_ID,
        dimension_ids: newOrder,
      }),
    );

    await waitFor(() => {
      const names = getListPanel()
        .getAllByTestId(/^dimension-row-/)
        .map((row) => row.getAttribute("data-testid"));
      expect(names).toEqual([
        "dimension-row-Country",
        "dimension-row-Suspend At",
        "dimension-row-Created At",
      ]);
    });

    expect(
      await getPostBody(`path:/api/metric/${METRIC_ID}/dimension/reorder`),
    ).toEqual({ dimension_ids: newOrder });
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
