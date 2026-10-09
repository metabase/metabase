import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupApplyMetadataGenerationRunEndpoint,
  setupDecideMetadataGenerationSuggestionsEndpoint,
  setupEditMetadataGenerationSuggestionEndpoint,
  setupListMetadataGenerationRunTablesEndpoint,
  setupListMetadataGenerationSuggestionsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  createMockMetadataGenerationApplyResult,
  createMockMetadataGenerationRunTable,
  createMockMetadataGenerationStatusCounts,
  createMockMetadataGenerationSuggestion,
} from "metabase-types/api/mocks";

import { ReviewModal } from "./ReviewModal";

const RUN_ID = 1;
const DECISIONS_PATH = `path:/api/ee/data-sensitivity/runs/${RUN_ID}/decisions`;
const APPLY_PATH = `path:/api/ee/data-sensitivity/runs/${RUN_ID}/apply`;

function setup() {
  const tables = [
    createMockMetadataGenerationRunTable({
      table_id: 10,
      table_name: "ORDERS",
      total: 4,
      counts: createMockMetadataGenerationStatusCounts({
        pending: 2,
        accepted: 1,
        stale: 1,
      }),
      human_set_pending: 1,
    }),
    createMockMetadataGenerationRunTable({
      table_id: 20,
      table_name: "PEOPLE",
      total: 1,
      counts: createMockMetadataGenerationStatusCounts({ applied: 1 }),
    }),
  ];
  const suggestions = [
    createMockMetadataGenerationSuggestion({
      id: 1,
      table_id: 10,
      field_id: 100,
      field_display_name: "Email",
      attribute: "data_sensitivity",
      proposed_value: "PII",
      reasoning: "Holds email addresses",
    }),
    createMockMetadataGenerationSuggestion({
      id: 2,
      table_id: 10,
      field_id: 101,
      field_display_name: "Total",
      field_base_type: "type/Float",
      field_effective_type: "type/Float",
      attribute: "semantic_type",
      source: "human",
      current_value: "type/Quantity",
      proposed_value: "type/Currency",
    }),
    createMockMetadataGenerationSuggestion({
      id: 3,
      table_id: 10,
      field_id: 102,
      field_display_name: "Notes",
      attribute: "description",
      proposed_value: "Free-text notes",
      edited_value: "Notes the customer wrote at checkout",
      status: "accepted",
    }),
    createMockMetadataGenerationSuggestion({
      id: 4,
      table_id: 10,
      field_id: 103,
      field_display_name: "Created At",
      attribute: "semantic_type",
      proposed_value: "type/CreationTimestamp",
      status: "stale",
    }),
  ];

  setupListMetadataGenerationRunTablesEndpoint(RUN_ID, tables);
  setupListMetadataGenerationSuggestionsEndpoint(RUN_ID, 10, suggestions);
  setupListMetadataGenerationSuggestionsEndpoint(RUN_ID, 20, []);
  setupDecideMetadataGenerationSuggestionsEndpoint(RUN_ID);
  suggestions.forEach((suggestion) =>
    setupEditMetadataGenerationSuggestionEndpoint(RUN_ID, suggestion),
  );
  setupApplyMetadataGenerationRunEndpoint(
    RUN_ID,
    createMockMetadataGenerationApplyResult({
      written: 1,
      stale: 1,
      failed: 1,
      failures: [
        {
          suggestion_id: 3,
          field_id: 102,
          attribute: "semantic_type",
          reason: "key_field",
        },
      ],
    }),
  );

  renderWithProviders(
    <ReviewModal runId={RUN_ID} opened onClose={jest.fn()} />,
  );
}

async function getLastDecisionBody() {
  await waitFor(() => {
    expect(
      fetchMock.callHistory.called(DECISIONS_PATH, { method: "POST" }),
    ).toBe(true);
  });
  const call = fetchMock.callHistory.lastCall(DECISIONS_PATH, {
    method: "POST",
  });
  return call?.request?.json();
}

async function getLastEditBody(suggestionId: number) {
  const path = `path:/api/ee/data-sensitivity/runs/${RUN_ID}/suggestions/${suggestionId}`;
  await waitFor(() => {
    expect(fetchMock.callHistory.called(path, { method: "PUT" })).toBe(true);
  });
  const call = fetchMock.callHistory.lastCall(path, { method: "PUT" });
  return call?.request?.json();
}

describe("ReviewModal", () => {
  it("lists the tables with their counts and the run totals", async () => {
    setup();

    const tables = await screen.findByTestId(
      "metadata-generation-review-tables",
    );
    expect(within(tables).getByText("PUBLIC.ORDERS")).toBeInTheDocument();
    expect(
      within(tables).getByText("2 not accepted · 1 accepted · 1 stale"),
    ).toBeInTheDocument();
    expect(within(tables).getByText("1 applied")).toBeInTheDocument();
    expect(
      screen.getByText(
        "1 suggestion would replace a value a person set. Accept it one by one.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply 1 accepted" }),
    ).toBeEnabled();
  });

  it("shows current and proposed values and marks human-set values", async () => {
    setup();

    const rows = await screen.findAllByTestId("metadata-generation-suggestion");
    expect(rows).toHaveLength(4);
    expect(
      within(rows[0]).getByText("Personally identifiable information"),
    ).toBeInTheDocument();
    expect(within(rows[0]).getByText("Empty")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Set by a person")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Currency")).toBeInTheDocument();
  });

  it("checks accepted rows and disables stale rows with a status marker", async () => {
    setup();

    const rows = await screen.findAllByTestId("metadata-generation-suggestion");
    const checkboxes = rows.map((row) => within(row).getByRole("checkbox"));
    expect(checkboxes[0]).not.toBeChecked();
    expect(checkboxes[1]).not.toBeChecked();
    expect(checkboxes[2]).toBeChecked();
    expect(checkboxes[3]).not.toBeChecked();
    expect(checkboxes[3]).toBeDisabled();
    expect(
      within(rows[3]).getByTestId("metadata-generation-suggestion-status"),
    ).toHaveTextContent("Stale");
    expect(
      within(rows[2]).queryByTestId("metadata-generation-suggestion-status"),
    ).not.toBeInTheDocument();
  });

  it("shows the reasoning icon in its own column and no confidence column", async () => {
    setup();

    const table = await screen.findByTestId("metadata-generation-suggestions");
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((header) => header.textContent),
    ).toEqual(["", "Field", "Attribute", "Current", "Proposed", ""]);
    expect(within(table).queryByText("High")).not.toBeInTheDocument();

    const rows = within(table).getAllByTestId("metadata-generation-suggestion");
    const reasoningCell = within(rows[0]).getAllByRole("cell")[5];
    expect(
      within(reasoningCell).getByLabelText("Reasoning"),
    ).toBeInTheDocument();
    expect(within(rows[1]).getAllByRole("cell")[5]).toBeEmptyDOMElement();
  });

  it("accepts one suggestion when its row is ticked", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: "Accept Data sensitivity of Email",
      }),
    );

    expect(await getLastDecisionBody()).toEqual({
      decision: "accept",
      suggestion_ids: [1],
    });
  });

  it("unaccepts one suggestion when its row is unticked", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("checkbox", {
        name: "Accept Description of Notes",
      }),
    );

    expect(await getLastDecisionBody()).toEqual({
      decision: "unaccept",
      suggestion_ids: [3],
    });
  });

  it("accepts a table without the human-set suggestions when the table checkbox is ticked", async () => {
    setup();

    const tableCheckbox = await screen.findByRole("checkbox", {
      name: "Accept the suggestions of this table",
    });
    expect(tableCheckbox).toBePartiallyChecked();
    await userEvent.click(tableCheckbox);

    expect(await getLastDecisionBody()).toEqual({
      decision: "accept",
      table_ids: [10],
    });
  });

  it("accepts the human-set suggestions of a table only on request", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Accept 1 value set by a person",
      }),
    );

    expect(await getLastDecisionBody()).toEqual({
      decision: "accept",
      suggestion_ids: [2],
    });
  });

  it("accepts all suggestions of the run", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Accept all" }),
    );

    expect(await getLastDecisionBody()).toEqual({
      decision: "accept",
      all: true,
    });
  });

  it("applies the accepted suggestions and shows the result", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Apply 1 accepted" }),
    );

    const result = await screen.findByTestId(
      "metadata-generation-apply-result",
    );
    expect(
      within(result).getByText(
        "1 value written, 1 skipped because the field changed, 1 failed",
      ),
    ).toBeInTheDocument();
    expect(
      within(result).getByText(
        "Field 102, Semantic type: The field is a primary or foreign key",
      ),
    ).toBeInTheDocument();
    expect(fetchMock.callHistory.called(APPLY_PATH, { method: "POST" })).toBe(
      true,
    );
  });

  it("shows an edited value with an Edited marker in place of the AI proposal", async () => {
    setup();

    const rows = await screen.findAllByTestId("metadata-generation-suggestion");
    expect(
      within(rows[2]).getByText("Notes the customer wrote at checkout"),
    ).toBeInTheDocument();
    expect(within(rows[2]).getByText("Edited")).toBeInTheDocument();
    expect(
      within(rows[2]).queryByText("Free-text notes"),
    ).not.toBeInTheDocument();
    expect(within(rows[0]).queryByText("Edited")).not.toBeInTheDocument();
  });

  it("clears the edit when the AI proposal is chosen again", async () => {
    setup();

    const rows = await screen.findAllByTestId("metadata-generation-suggestion");
    await userEvent.click(
      within(rows[2]).getByRole("button", { name: /Use AI proposal/ }),
    );

    expect(await getLastEditBody(3)).toEqual({ value: null });
  });

  it("saves an edited description", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", { name: "Edit Description of Notes" }),
    );
    const textarea = screen.getByRole("textbox", { name: "Description" });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "  Order notes  {Enter}");

    expect(await getLastEditBody(3)).toEqual({ value: "Order notes" });
  });

  it("saves an edited data sensitivity", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Edit Data sensitivity of Email",
      }),
    );
    await userEvent.click(
      await screen.findByRole("option", { name: "Confidential business data" }),
    );

    expect(await getLastEditBody(1)).toEqual({ value: "BIZ_CONF" });
  });

  it("does not offer key types or no semantic type when editing a semantic type", async () => {
    setup();

    await userEvent.click(
      await screen.findByRole("button", {
        name: "Edit Semantic type of Total",
      }),
    );

    expect(
      await screen.findByRole("option", { name: /Currency/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /Entity Key/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /No semantic type/ }),
    ).not.toBeInTheDocument();
  });

  it("does not offer to edit a stale suggestion", async () => {
    setup();

    const rows = await screen.findAllByTestId("metadata-generation-suggestion");
    expect(within(rows[3]).queryByRole("button")).not.toBeInTheDocument();
  });
});
