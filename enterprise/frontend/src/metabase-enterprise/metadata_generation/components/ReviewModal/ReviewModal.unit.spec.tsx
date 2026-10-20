import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupApplyMetadataGenerationRunEndpoint,
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
const APPLY_PATH = `path:/api/ee/data-sensitivity/runs/${RUN_ID}/apply`;

function setup() {
  const tables = [
    createMockMetadataGenerationRunTable({
      table_id: 10,
      table_name: "ORDERS",
      total: 4,
      counts: createMockMetadataGenerationStatusCounts({
        pending: 3,
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

  return renderWithProviders(
    <ReviewModal runId={RUN_ID} opened onClose={jest.fn()} />,
  );
}

function getMutationCalls() {
  return fetchMock.callHistory
    .calls()
    .filter((call) => (call.options.method ?? "get").toUpperCase() !== "GET");
}

async function getApplyBody(): Promise<unknown> {
  await waitFor(() => {
    expect(fetchMock.callHistory.called(APPLY_PATH, { method: "POST" })).toBe(
      true,
    );
  });
  const call = fetchMock.callHistory.lastCall(APPLY_PATH, { method: "POST" });
  return call?.request?.json();
}

async function getRowCheckbox(name: string) {
  return screen.findByRole("checkbox", { name });
}

describe("ReviewModal", () => {
  it("lists the tables with their counts, with nothing selected", async () => {
    setup();

    const tables = await screen.findByTestId(
      "metadata-generation-review-tables",
    );
    expect(within(tables).getByText("PUBLIC.ORDERS")).toBeInTheDocument();
    expect(
      within(tables).getByText("4 suggestions · 1 stale"),
    ).toBeInTheDocument();
    expect(
      within(tables).getByText("1 suggestion · 1 applied"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "1 suggestion would replace a value a person set. Accept it one by one.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Apply 0 selected" }),
    ).toBeDisabled();
  });

  it("shows current and proposed values and marks human-set values", async () => {
    setup();

    const rows = await screen.findAllByTestId("metadata-generation-suggestion");
    expect(rows).toHaveLength(4);
    expect(within(rows[0]).getByText("Empty")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Set by a person")).toBeInTheDocument();
  });

  it("ticks and unticks a row without sending a request", async () => {
    setup();

    const checkbox = await getRowCheckbox("Accept Data sensitivity of Email");
    expect(checkbox).not.toBeChecked();

    await userEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    expect(
      screen.getByRole("button", { name: "Apply 1 selected" }),
    ).toBeEnabled();

    await userEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Apply 0 selected" }),
    ).toBeDisabled();
    expect(getMutationCalls()).toHaveLength(0);
  });

  it("shows no checkbox and a status marker for a stale row", async () => {
    setup();

    const rows = await screen.findAllByTestId("metadata-generation-suggestion");
    expect(within(rows[3]).queryByRole("checkbox")).not.toBeInTheDocument();
    expect(
      within(rows[3]).getByTestId("metadata-generation-suggestion-status"),
    ).toHaveTextContent("Stale");
    expect(within(rows[3]).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("selects the table without the human-set suggestions and applies them in one request", async () => {
    setup();

    const tableCheckbox = await screen.findByRole("checkbox", {
      name: "Accept the suggestions of this table",
    });
    expect(tableCheckbox).not.toBeChecked();
    await userEvent.click(tableCheckbox);

    expect(tableCheckbox).toBeChecked();
    expect(
      await getRowCheckbox("Accept Semantic type of Total"),
    ).not.toBeChecked();
    expect(getMutationCalls()).toHaveLength(0);

    await userEvent.click(
      screen.getByRole("button", { name: "Apply 2 selected" }),
    );

    expect(await getApplyBody()).toEqual({ accept: [1, 3] });
    expect(getMutationCalls()).toHaveLength(1);
  });

  it("sends an edited value with the selection, and the edit selects its row", async () => {
    setup();

    const textarea = await screen.findByRole("textbox", {
      name: "Proposed Description of Notes",
    });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "  Order notes  {Enter}");

    expect(await getRowCheckbox("Accept Description of Notes")).toBeChecked();
    expect(getMutationCalls()).toHaveLength(0);

    await userEvent.click(
      screen.getByRole("button", { name: "Apply 1 selected" }),
    );

    expect(await getApplyBody()).toEqual({
      accept: [3],
      edits: { 3: "Order notes" },
    });
  });

  it("does not send the edit of a row that was unticked", async () => {
    setup();

    const textarea = await screen.findByRole("textbox", {
      name: "Proposed Description of Notes",
    });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Order notes{Enter}");
    await userEvent.click(await getRowCheckbox("Accept Description of Notes"));
    await userEvent.click(
      await getRowCheckbox("Accept Data sensitivity of Email"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Apply 1 selected" }),
    );

    expect(await getApplyBody()).toEqual({ accept: [1] });
  });

  it("drops the edit when the AI proposal is chosen again and keeps the row selected", async () => {
    setup();

    const textarea = await screen.findByRole("textbox", {
      name: "Proposed Description of Notes",
    });
    await userEvent.clear(textarea);
    await userEvent.type(textarea, "Order notes{Enter}");
    await userEvent.click(
      screen.getByRole("button", {
        name: "Use the AI proposal for Description of Notes",
      }),
    );

    expect(
      screen.getByRole("textbox", { name: "Proposed Description of Notes" }),
    ).toHaveValue("Free-text notes");
    await userEvent.click(
      screen.getByRole("button", { name: "Apply 1 selected" }),
    );

    expect(await getApplyBody()).toEqual({ accept: [3] });
  });

  it("shows the apply result and clears the selection", async () => {
    setup();

    await userEvent.click(
      await getRowCheckbox("Accept Data sensitivity of Email"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Apply 1 selected" }),
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
    expect(
      await screen.findByRole("button", { name: "Apply 0 selected" }),
    ).toBeDisabled();
  });

  it("starts with nothing selected after a reload", async () => {
    const { unmount } = setup();

    await userEvent.click(
      await getRowCheckbox("Accept Data sensitivity of Email"),
    );
    expect(
      screen.getByRole("button", { name: "Apply 1 selected" }),
    ).toBeEnabled();
    unmount();

    renderWithProviders(
      <ReviewModal runId={RUN_ID} opened onClose={jest.fn()} />,
    );

    expect(
      await getRowCheckbox("Accept Data sensitivity of Email"),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Apply 0 selected" }),
    ).toBeDisabled();
  });
});
