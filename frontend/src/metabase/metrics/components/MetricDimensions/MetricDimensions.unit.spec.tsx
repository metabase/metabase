import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupMetricDimensionsEndpoints,
  setupMetricEndpoint,
} from "__support__/server-mocks";
import {
  act,
  renderWithProviders,
  screen,
  waitFor,
  waitForLoaderToBeRemoved,
  within,
} from "__support__/ui";
import * as Analytics from "metabase/analytics";
import { metricApi } from "metabase/api/metric";
import type { ListMetricDimensionsResponse } from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockField,
  createMockTable,
} from "metabase-types/api/mocks";
import {
  createMockAddableDimensionGroup,
  createMockAddableMetricDimension,
  createMockMetric,
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

const BILLED_AT = createMockAddableMetricDimension({
  id: "44444444-4444-4444-8444-444444444444",
  display_name: "Billed At",
  effective_type: "type/DateTime",
  semantic_type: null,
  sources: [{ type: "field", "field-id": 201 }],
  mapping_target: ["field", { "source-field": 105 }, 201],
});

const PLAN_NAME = createMockAddableMetricDimension({
  id: "55555555-5555-4555-8555-555555555555",
  display_name: "Plan Name",
  effective_type: "type/Text",
  semantic_type: null,
  sources: [{ type: "field", "field-id": 202 }],
  mapping_target: ["field", { "source-field": 105 }, 202],
});

const ADDABLE_GROUP = createMockAddableDimensionGroup({
  group: createMockMetricDimensionGroup({
    id: "fk",
    type: "connection",
    display_name: "Some FK-linked table",
  }),
  dimensions: [BILLED_AT, PLAN_NAME],
});

const SELF_ADDABLE_COLUMN = createMockAddableMetricDimension({
  id: "66666666-6666-4666-8666-666666666666",
  display_name: "Plan Updated At",
  effective_type: "type/DateTime",
  semantic_type: null,
  sources: [{ type: "field", "field-id": 104 }],
  mapping_target: ["field", {}, 104],
});

const SELF_ADDABLE_GROUP = createMockAddableDimensionGroup({
  group: createMockMetricDimensionGroup({
    id: "main",
    type: "main",
    display_name: "The main table",
  }),
  dimensions: [SELF_ADDABLE_COLUMN],
});

const QUERY_METADATA = createMockCardQueryMetadata({
  tables: [
    createMockTable({
      fields: [
        createMockField({ id: 101, display_name: "Created At" }),
        createMockField({ id: 102, display_name: "City" }),
      ],
    }),
  ],
});

function setup(response?: Partial<ListMetricDimensionsResponse>) {
  const fullResponse: ListMetricDimensionsResponse = {
    added: [CREATED_AT, COUNTRY, SUSPEND_AT],
    addable: [SELF_ADDABLE_GROUP, ADDABLE_GROUP],
    ...response,
  };
  setupMetricDimensionsEndpoints(METRIC_ID, fullResponse);
  setupMetricEndpoint(
    createMockMetric({
      id: METRIC_ID,
      dimensions: fullResponse.added,
      dimension_mappings: [
        {
          dimension_id: CREATED_AT_ID,
          table_id: 1,
          target: ["field", {}, 101],
        },
        {
          dimension_id: COUNTRY_ID,
          table_id: 1,
          target: ["field", {}, 102],
        },
      ],
    }),
  );
  const { store } = renderWithProviders(
    <MetricDimensions metricId={METRIC_ID} queryMetadata={QUERY_METADATA} />,
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

  it("shows an empty state and hides search when no dimensions have been added", async () => {
    setup({ added: [] });
    await waitForLoaderToBeRemoved();

    expect(
      getListPanel().getByText("No dimensions have been added."),
    ).toBeInTheDocument();
    expect(
      getListPanel().queryByPlaceholderText("Search…"),
    ).not.toBeInTheDocument();
  });

  it("shows a search empty state and keeps search visible", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const search = getListPanel().getByPlaceholderText("Search…");
    await userEvent.type(search, "Missing");

    expect(
      await getListPanel().findByText("No dimensions match your search."),
    ).toBeInTheDocument();
    expect(search).toBeInTheDocument();
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

  it("shows the empty state after removing the final dimension", async () => {
    setup({ added: [COUNTRY] });
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      getListPanel().getByRole("checkbox", { name: "Country" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Remove" }));

    expect(
      await getListPanel().findByText("No dimensions have been added."),
    ).toBeInTheDocument();
    expect(
      getListPanel().queryByPlaceholderText("Search…"),
    ).not.toBeInTheDocument();
    expect(
      await getPostBody(`path:/api/metric/${METRIC_ID}/dimension/remove`),
    ).toEqual({ dimension_ids: [COUNTRY_ID] });
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

  it("shows an empty state and hides search when all dimensions have been added", async () => {
    setup({ addable: [] });
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      screen.getByRole("button", { name: "Available dimensions" }),
    );

    const addPanel = within(await screen.findByTestId("add-dimensions-panel"));
    await waitForLoaderToBeRemoved();
    expect(
      addPanel.getByText("All available dimensions have been added"),
    ).toBeInTheDocument();
    expect(addPanel.queryByPlaceholderText("Search…")).not.toBeInTheDocument();
  });

  it("shows an available-dimension search empty state and keeps search visible", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    await userEvent.click(
      screen.getByRole("button", { name: "Available dimensions" }),
    );
    const addPanel = within(await screen.findByTestId("add-dimensions-panel"));
    await waitForLoaderToBeRemoved();
    const search = addPanel.getByPlaceholderText("Search…");
    await userEvent.type(search, "Missing");

    expect(
      await addPanel.findByText("No dimensions match your search."),
    ).toBeInTheDocument();
    expect(search).toBeInTheDocument();
  });

  it("edits a dimension's display name", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    expect(settings.getByText("Settings for Created At")).toBeInTheDocument();

    const nameInput = settings.getByLabelText("Display name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "  Creation date  ");
    await userEvent.tab();

    await waitFor(async () => {
      const body = await getPostBody(
        `path:/api/metric/${METRIC_ID}/dimension/${CREATED_AT_ID}`,
      );
      expect(body.display_name).toBe("Creation date");
    });
    expect(nameInput).toHaveValue("Creation date");
  });

  it("restores a blank display name without making a request", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    const nameInput = settings.getByLabelText("Display name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "   ");
    await userEvent.tab();

    expect(nameInput).toHaveValue("Created At");
    expect(
      fetchMock.callHistory.calls(
        `path:/api/metric/${METRIC_ID}/dimension/${CREATED_AT_ID}`,
        { method: "POST" },
      ),
    ).toHaveLength(0);
  });

  it("restores the persisted display name when an update fails", async () => {
    setup();
    fetchMock.modifyRoute(
      `metric-${METRIC_ID}-dimension-${CREATED_AT_ID}-update`,
      { response: { status: 500 } },
    );
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    const nameInput = settings.getByLabelText("Display name");
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Creation date");
    await userEvent.tab();

    await waitFor(() => {
      expect(nameInput).toHaveValue("Created At");
    });
  });

  it("shows an unset time grouping without selecting an effective default", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    const groupingSelect = await settings.findByLabelText("Time grouping");

    expect(groupingSelect).toHaveValue("");
    expect(groupingSelect).toHaveAttribute(
      "placeholder",
      "Select a time grouping",
    );
  });

  it("updates a temporal dimension's time grouping immediately", async () => {
    setup({
      added: [
        createMockMetricDimension({
          ...CREATED_AT,
          default_temporal_unit: "week",
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    const groupingSelect = await settings.findByLabelText("Time grouping");
    expect(groupingSelect).toHaveValue("Week");

    await userEvent.click(groupingSelect);
    await userEvent.click(screen.getByRole("option", { name: "Month" }));

    await waitFor(async () => {
      const body = await getPostBody(
        `path:/api/metric/${METRIC_ID}/dimension/${CREATED_AT_ID}`,
      );
      expect(body.default_temporal_unit).toBe("month");
    });
    expect(groupingSelect).toHaveValue("Month");
  });

  it("restores the persisted time grouping when an update fails", async () => {
    setup({
      added: [
        createMockMetricDimension({
          ...CREATED_AT,
          default_temporal_unit: "week",
        }),
      ],
    });
    fetchMock.modifyRoute(
      `metric-${METRIC_ID}-dimension-${CREATED_AT_ID}-update`,
      { response: { status: 500 } },
    );
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    const groupingSelect = await settings.findByLabelText("Time grouping");
    await userEvent.click(groupingSelect);
    await userEvent.click(screen.getByRole("option", { name: "Month" }));

    await waitFor(() => {
      expect(groupingSelect).toHaveValue("Week");
    });
  });

  it("does not show a time grouping for non-date dimensions", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Country/));

    expect(settings.queryByLabelText("Time grouping")).not.toBeInTheDocument();
  });

  it("shows only type-compatible time groupings for Date dimensions", async () => {
    setup({
      added: [
        createMockMetricDimension({
          ...CREATED_AT,
          effective_type: "type/Date",
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    await userEvent.click(await settings.findByLabelText("Time grouping"));

    expect(screen.getByRole("option", { name: "Month" })).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Hour" }),
    ).not.toBeInTheDocument();
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

  it("removes the default from the current default dimension", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Created At/));
    expect(settings.getByText("Default dimension")).toBeInTheDocument();
    expect(
      settings.queryByRole("button", { name: "Set as default" }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      settings.getByRole("button", { name: "Remove default" }),
    );

    await waitFor(async () => {
      expect(
        await getPostBody(
          `path:/api/metric/${METRIC_ID}/dimension/set-default`,
        ),
      ).toEqual({ dimension_id: null });
    });
  });

  it("does not offer set-default for orphaned dimensions", async () => {
    setup();
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Suspend At/));
    expect(
      settings.queryByRole("button", { name: "Set as default" }),
    ).not.toBeInTheDocument();
    expect(
      settings.queryByRole("button", { name: "Remove default" }),
    ).not.toBeInTheDocument();
  });

  it("still offers remove-default for an orphaned default dimension", async () => {
    setup({
      added: [
        { ...CREATED_AT, default: false },
        COUNTRY,
        { ...SUSPEND_AT, default: true },
      ],
    });
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/Suspend At/));
    await userEvent.click(
      settings.getByRole("button", { name: "Remove default" }),
    );

    await waitFor(async () => {
      expect(
        await getPostBody(
          `path:/api/metric/${METRIC_ID}/dimension/set-default`,
        ),
      ).toEqual({ dimension_id: null });
    });
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

  it("does not use the dimension display name for the source column", async () => {
    setup({
      added: [
        createMockMetricDimension({
          ...COUNTRY,
          display_name: "User - City",
          group: createMockMetricDimensionGroup({
            type: "connection",
            display_name: "User",
          }),
          sources: [{ type: "field", "field-id": 102 }],
        }),
      ],
    });
    await waitForLoaderToBeRemoved();

    const settings = within(await openSettings(/User - City/));
    const sourceField = within(settings.getByTestId("dimension-source"));

    expect(sourceField.getByText("User.City")).toBeInTheDocument();
    expect(sourceField.queryByText("User.User - City")).not.toBeInTheDocument();
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

  describe("curation flow", () => {
    const SEEDED = [
      ["ID", "type/BigInteger", "type/PK"],
      ["User ID", "type/Integer", "type/FK"],
      ["Product ID", "type/Integer", "type/FK"],
      ["Subtotal", "type/Float", null],
      ["Tax", "type/Float", null],
      ["Total", "type/Float", null],
      ["Discount", "type/Float", "type/Discount"],
      ["Created At", "type/DateTime", "type/CreationTimestamp"],
      ["Quantity", "type/Integer", "type/Quantity"],
    ].map(([name, effectiveType, semanticType], index) =>
      createMockMetricDimension({
        id: `00000000-0000-4000-8000-00000000000${index}`,
        display_name: String(name),
        effective_type: String(effectiveType),
        semantic_type: semanticType,
        status: "status/active",
        group: MAIN_GROUP,
        sources: [{ type: "field", "field-id": 300 + index }],
      }),
    );
    const SEEDED_NAMES = SEEDED.map((dimension) => dimension.display_name);
    const TAX_ID = SEEDED[4].id;
    const CREATED_AT_SEEDED_ID = SEEDED[7].id;
    const QUANTITY_ID = SEEDED[8].id;
    const PRODUCT_CATEGORY = createMockAddableMetricDimension({
      id: "77777777-7777-4777-8777-777777777777",
      display_name: "Category",
      effective_type: "type/Text",
      semantic_type: "type/Category",
      sources: [{ type: "field", "field-id": 401 }],
      mapping_target: ["field", { "source-field": 302 }, 401],
    });
    const ADDABLE_GROUPS = [
      createMockAddableDimensionGroup({
        group: createMockMetricDimensionGroup({
          id: "product",
          type: "connection",
          display_name: "Product",
        }),
        dimensions: [
          createMockAddableMetricDimension({
            id: "88888888-8888-4888-8888-888888888888",
            display_name: "Vendor",
            effective_type: "type/Text",
            semantic_type: "type/Company",
            sources: [{ type: "field", "field-id": 402 }],
            mapping_target: ["field", { "source-field": 302 }, 402],
          }),
          PRODUCT_CATEGORY,
        ],
      }),
      createMockAddableDimensionGroup({
        group: createMockMetricDimensionGroup({
          id: "user",
          type: "connection",
          display_name: "User",
        }),
        dimensions: [
          createMockAddableMetricDimension({
            id: "99999999-9999-4999-8999-999999999999",
            display_name: "City",
            effective_type: "type/Text",
            semantic_type: "type/City",
            sources: [{ type: "field", "field-id": 501 }],
            mapping_target: ["field", { "source-field": 301 }, 501],
          }),
        ],
      }),
    ];

    let trackSimpleEvent: jest.SpiedFunction<typeof Analytics.trackSimpleEvent>;

    beforeEach(() => {
      trackSimpleEvent = jest.spyOn(Analytics, "trackSimpleEvent");
      trackSimpleEvent.mockClear();
      mockRowRects();
    });

    afterEach(() => {
      trackSimpleEvent.mockRestore();
      jest.restoreAllMocks();
    });

    function getRowNames() {
      return getListPanel()
        .queryAllByTestId(/^dimension-row-/)
        .map((row) =>
          row.getAttribute("data-testid")?.replace("dimension-row-", ""),
        );
    }

    function getTrackedEvents(event: string) {
      return trackSimpleEvent.mock.calls
        .map(([payload]) => payload)
        .filter((payload) => payload.event === event);
    }

    async function getLastPostBody(name: string): Promise<unknown> {
      await waitFor(() => {
        expect(fetchMock.callHistory.called(name)).toBe(true);
      });
      const body = fetchMock.callHistory.lastCall(name)?.options?.body;
      return JSON.parse(String(body));
    }

    it("searches, reorders by drag and drop, adds, renames, describes, sets and removes the default, sets the time grouping, and bulk removes dimensions", async () => {
      setup({ added: SEEDED, addable: ADDABLE_GROUPS });
      await waitForLoaderToBeRemoved();

      expect(getTrackedEvents("metric_dimensions_tab_viewed")).toEqual([
        { event: "metric_dimensions_tab_viewed", target_id: METRIC_ID },
      ]);

      expect(getRowNames()).toEqual(SEEDED_NAMES);
      expect(getListPanel().queryByText("Vendor")).not.toBeInTheDocument();
      expect(getListPanel().queryByText("Default")).not.toBeInTheDocument();

      // search
      const search = getListPanel().getByPlaceholderText("Search…");
      await userEvent.type(search, "Disc");
      await waitFor(() => {
        expect(getRowNames()).toEqual(["Discount"]);
      });
      await userEvent.clear(search);
      await waitFor(() => {
        expect(getRowNames()).toEqual(SEEDED_NAMES);
      });

      // drag Quantity to the top
      await dragRowAbove("Quantity", "ID");
      expect(
        await getLastPostBody(`metric-${METRIC_ID}-dimensions-reorder`),
      ).toEqual({
        dimension_ids: [
          QUANTITY_ID,
          ...SEEDED.slice(0, 8).map((dimension) => dimension.id),
        ],
      });
      await waitFor(() => {
        expect(getRowNames()).toEqual([
          "Quantity",
          ...SEEDED_NAMES.slice(0, 8),
        ]);
      });
      await waitFor(() => {
        expect(getTrackedEvents("metric_dimensions_reordered")).toEqual([
          {
            event: "metric_dimensions_reordered",
            target_id: METRIC_ID,
            result: "success",
          },
        ]);
      });

      // add a dimension from a connected table
      await userEvent.click(
        getListPanel().getByRole("button", { name: "Available dimensions" }),
      );
      const addPanel = within(
        await screen.findByTestId("add-dimensions-panel"),
      );
      expect(await addPanel.findByText("Product")).toBeInTheDocument();
      expect(addPanel.getByText("User")).toBeInTheDocument();
      await userEvent.click(addPanel.getByRole("button", { name: /Category/ }));
      expect(
        await getLastPostBody(`metric-${METRIC_ID}-dimensions-add`),
      ).toEqual({
        dimensions: [
          { ...PRODUCT_CATEGORY, display_name: "Product - Category" },
        ],
      });
      expect(
        await getListPanel().findByTestId("dimension-row-Product - Category"),
      ).toBeInTheDocument();
      expect(getTrackedEvents("metric_dimension_added")).toEqual([
        {
          event: "metric_dimension_added",
          target_id: METRIC_ID,
          event_detail: PRODUCT_CATEGORY.id,
          result: "success",
        },
      ]);
      await userEvent.click(addPanel.getByRole("button", { name: "Done" }));
      expect(getRowNames()).toHaveLength(SEEDED.length + 1);
      expect(
        screen.queryByTestId("add-dimensions-panel"),
      ).not.toBeInTheDocument();

      // rename it
      const categoryUpdateRoute = `metric-${METRIC_ID}-dimension-${PRODUCT_CATEGORY.id}-update`;
      let settings = within(await openSettings(/Product - Category/));
      expect(
        settings.getByText("Settings for Product - Category"),
      ).toBeInTheDocument();
      const nameInput = settings.getByLabelText("Display name");
      await userEvent.clear(nameInput);
      await userEvent.type(nameInput, "Product type");
      await userEvent.tab();
      expect(await getLastPostBody(categoryUpdateRoute)).toEqual({
        display_name: "Product type",
      });
      expect(
        await getListPanel().findByTestId("dimension-row-Product type"),
      ).toBeInTheDocument();
      expect(
        await settings.findByText("Settings for Product type"),
      ).toBeInTheDocument();

      // describe it
      await userEvent.type(
        settings.getByLabelText("Description"),
        "Category of the ordered product",
      );
      await userEvent.tab();
      await waitFor(() => {
        expect(fetchMock.callHistory.calls(categoryUpdateRoute)).toHaveLength(
          2,
        );
      });
      expect(await getLastPostBody(categoryUpdateRoute)).toEqual({
        description: "Category of the ordered product",
      });
      await waitFor(() => {
        expect(getTrackedEvents("metric_dimension_updated")).toEqual([
          {
            event: "metric_dimension_updated",
            target_id: METRIC_ID,
            event_detail: PRODUCT_CATEGORY.id,
            result: "success",
          },
          {
            event: "metric_dimension_updated",
            target_id: METRIC_ID,
            event_detail: PRODUCT_CATEGORY.id,
            result: "success",
          },
        ]);
      });

      // make it the default
      const setDefaultRoute = `metric-${METRIC_ID}-dimensions-set-default`;
      await clickWhenEnabled(
        settings.getByRole("button", { name: "Set as default" }),
      );
      expect(await getLastPostBody(setDefaultRoute)).toEqual({
        dimension_id: PRODUCT_CATEGORY.id,
      });
      expect(
        await getDimensionRow("Product type").findByText("Default"),
      ).toBeInTheDocument();
      expect(settings.getByText("Default dimension")).toBeInTheDocument();
      expect(getListPanel().getAllByText("Default")).toHaveLength(1);
      expect(getTrackedEvents("metric_dimension_set_default")).toEqual([
        {
          event: "metric_dimension_set_default",
          target_id: METRIC_ID,
          event_detail: PRODUCT_CATEGORY.id,
          result: "success",
        },
      ]);

      // remove the default (UXW-4988)
      await clickWhenEnabled(
        await settings.findByRole("button", { name: "Remove default" }),
      );
      expect(await getLastPostBody(setDefaultRoute)).toEqual({
        dimension_id: null,
      });
      await waitFor(() => {
        expect(getListPanel().queryByText("Default")).not.toBeInTheDocument();
      });
      expect(settings.queryByText("Default dimension")).not.toBeInTheDocument();
      expect(getTrackedEvents("metric_dimension_remove_default")).toEqual([
        {
          event: "metric_dimension_remove_default",
          target_id: METRIC_ID,
          event_detail: PRODUCT_CATEGORY.id,
          result: "success",
        },
      ]);

      // make it the default again
      await clickWhenEnabled(
        await settings.findByRole("button", { name: "Set as default" }),
      );
      await waitFor(() => {
        expect(getListPanel().getAllByText("Default")).toHaveLength(1);
      });
      expect(await getLastPostBody(setDefaultRoute)).toEqual({
        dimension_id: PRODUCT_CATEGORY.id,
      });

      // set the time grouping of Created At
      settings = within(await openSettings(/Created At/));
      const groupingSelect = await settings.findByLabelText("Time grouping");
      expect(groupingSelect).toHaveValue("");
      await userEvent.click(groupingSelect);
      await userEvent.click(screen.getByRole("option", { name: "Week" }));
      expect(
        await getLastPostBody(
          `metric-${METRIC_ID}-dimension-${CREATED_AT_SEEDED_ID}-update`,
        ),
      ).toEqual({ default_temporal_unit: "week" });
      expect(groupingSelect).toHaveValue("Week");

      // bulk remove
      await userEvent.click(
        getListPanel().getByRole("checkbox", { name: "Product type" }),
      );
      await userEvent.click(
        getListPanel().getByRole("checkbox", { name: "Tax" }),
      );
      expect(
        getListPanel().getByRole("button", { name: "Available dimensions" }),
      ).toBeDisabled();
      await userEvent.click(
        getListPanel().getByRole("button", { name: "Remove" }),
      );
      expect(
        await getLastPostBody(`metric-${METRIC_ID}-dimensions-remove`),
      ).toEqual({ dimension_ids: [PRODUCT_CATEGORY.id, TAX_ID] });
      await waitFor(() => {
        expect(getRowNames()).toHaveLength(SEEDED.length - 1);
      });
      expect(getRowNames()).not.toContain("Product type");
      expect(getRowNames()).not.toContain("Tax");
      expect(getTrackedEvents("metric_dimension_removed")).toEqual([
        {
          event: "metric_dimension_removed",
          target_id: METRIC_ID,
          event_detail: PRODUCT_CATEGORY.id,
          result: "success",
        },
        {
          event: "metric_dimension_removed",
          target_id: METRIC_ID,
          event_detail: TAX_ID,
          result: "success",
        },
      ]);
    });
  });
});

// The default buttons stay disabled while the list refetches after an edit
async function clickWhenEnabled(button: HTMLElement) {
  await waitFor(() => {
    expect(button).toBeEnabled();
  });
  await userEvent.click(button);
}

const ROW_HEIGHT = 40;

/**
 * jsdom has no layout. Gives every sortable row a rect from its position in
 * the list, so dnd-kit can find the row a dragged one crosses. The drag
 * overlay's copy of a row starts where that row is.
 */
function mockRowRects() {
  const original = Element.prototype.getBoundingClientRect;
  jest
    .spyOn(Element.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: Element) {
      if (!(this instanceof HTMLElement) || this.role !== "listitem") {
        return original.call(this);
      }
      const list = screen.getByTestId("metric-dimension-list");
      const rowTestIds = within(list)
        .getAllByTestId(/^dimension-row-/)
        .map((row) => row.dataset.testid);
      const testId = within(this).getByTestId(/^dimension-row-/).dataset.testid;
      return DOMRect.fromRect({
        x: 0,
        y: rowTestIds.indexOf(testId) * ROW_HEIGHT,
        width: 300,
        height: ROW_HEIGHT,
      });
    });
}

function dispatchPointer(
  target: EventTarget,
  type: string,
  coordinates: { clientX: number; clientY: number },
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    ...coordinates,
  });
  Object.defineProperty(event, "isPrimary", { value: true });
  act(() => {
    target.dispatchEvent(event);
  });
}

async function dragRowAbove(sourceName: string, targetName: string) {
  const list = within(screen.getByTestId("metric-dimension-list"));
  const rows = list.getAllByRole("listitem");
  const sourceIndex = rows.findIndex((row) =>
    within(row).queryByTestId(`dimension-row-${sourceName}`),
  );
  const targetIndex = rows.findIndex((row) =>
    within(row).queryByTestId(`dimension-row-${targetName}`),
  );
  const handle = within(rows[sourceIndex]).getByTestId("dimension-drag-handle");
  const startY = sourceIndex * ROW_HEIGHT + ROW_HEIGHT / 2;
  // dnd-kit picks the row the dragged row overlaps most
  const endY = targetIndex * ROW_HEIGHT + ROW_HEIGHT / 4;

  dispatchPointer(handle, "pointerdown", { clientX: 10, clientY: startY });
  dispatchPointer(document, "pointermove", {
    clientX: 10,
    clientY: startY - 20,
  });
  dispatchPointer(document, "pointermove", { clientX: 10, clientY: endY });
  dispatchPointer(document, "pointerup", { clientX: 10, clientY: endY });
  // The drag overlay renders a copy of the row until its drop animation ends
  await waitFor(() => {
    expect(screen.getAllByTestId(`dimension-row-${sourceName}`)).toHaveLength(
      1,
    );
  });
}
