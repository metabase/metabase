import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupApplyMetadataGenerationProposalsEndpoint,
  setupListMetadataGenerationProposalTablesEndpoint,
  setupListMetadataGenerationProposalsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import {
  createMockMetadataGenerationApplyResult,
  createMockMetadataGenerationProposal,
  createMockMetadataGenerationProposalTable,
} from "metabase-types/api/mocks";

import { ReviewModal } from "./ReviewModal";

const DATABASE_ID = 1;
const APPLY_PATH = "path:/api/ee/data-sensitivity/proposals/apply";

function setup() {
  const tables = [
    createMockMetadataGenerationProposalTable({
      table_id: 10,
      table_name: "ORDERS",
      pending: 3,
      human_set_pending: 1,
    }),
    createMockMetadataGenerationProposalTable({
      table_id: 20,
      table_name: "PEOPLE",
      pending: 1,
    }),
  ];
  const proposals = [
    createMockMetadataGenerationProposal({
      id: 1,
      table_id: 10,
      field_id: 100,
      field_display_name: "Email",
      attribute: "data_sensitivity",
      proposed_value: "PII",
      reasoning: "Holds email addresses",
    }),
    createMockMetadataGenerationProposal({
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
    createMockMetadataGenerationProposal({
      id: 3,
      table_id: 10,
      field_id: 102,
      field_display_name: "Notes",
      attribute: "description",
      proposed_value: "Free-text notes",
    }),
  ];

  fetchMock.get(`path:/api/database/${DATABASE_ID}/metadata`, {
    id: DATABASE_ID,
    tables: [],
  });
  setupListMetadataGenerationProposalTablesEndpoint(tables);
  setupListMetadataGenerationProposalsEndpoint(10, proposals);
  setupListMetadataGenerationProposalsEndpoint(20, [
    createMockMetadataGenerationProposal({
      id: 4,
      table_id: 20,
      field_id: 200,
      field_display_name: "Name",
    }),
  ]);
  setupApplyMetadataGenerationProposalsEndpoint(
    createMockMetadataGenerationApplyResult({
      written: 1,
      failed: 2,
      failures: [
        {
          proposal_id: 3,
          field_id: 102,
          attribute: "semantic_type",
          reason: "key_field",
        },
        {
          proposal_id: 4,
          field_id: null,
          attribute: null,
          reason: "changed",
        },
      ],
    }),
  );

  return renderWithProviders(
    <ReviewModal databaseId={DATABASE_ID} opened onClose={jest.fn()} />,
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
    expect(within(tables).getByText("3 suggestions")).toBeInTheDocument();
    expect(within(tables).getByText("1 suggestion")).toBeInTheDocument();
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
    expect(rows).toHaveLength(3);
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

  it("keeps the selection of a table when the person switches to another table", async () => {
    setup();

    await userEvent.click(
      await getRowCheckbox("Accept Data sensitivity of Email"),
    );
    await userEvent.click(await screen.findByText("PUBLIC.PEOPLE"));
    await userEvent.click(
      await getRowCheckbox("Accept Data sensitivity of Name"),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Apply 2 selected" }),
    );

    expect(await getApplyBody()).toEqual({
      accept: [1, 4],
      proposed_values: { 1: "PII", 4: "PII" },
    });
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

    expect(await getApplyBody()).toEqual({
      accept: [1, 3],
      proposed_values: { 1: "PII", 3: "Free-text notes" },
    });
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
      proposed_values: { 3: "Free-text notes" },
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

    expect(await getApplyBody()).toEqual({
      accept: [1],
      proposed_values: { 1: "PII" },
    });
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

    expect(await getApplyBody()).toEqual({
      accept: [3],
      proposed_values: { 3: "Free-text notes" },
    });
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
      within(result).getByText("1 value written, 2 failed"),
    ).toBeInTheDocument();
    expect(
      within(result).getByText(
        "Field 102, Semantic type: The field is a primary or foreign key",
      ),
    ).toBeInTheDocument();
    expect(
      within(result).getByText(
        "A newer run changed or removed this suggestion",
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
      <ReviewModal databaseId={DATABASE_ID} opened onClose={jest.fn()} />,
    );

    expect(
      await getRowCheckbox("Accept Data sensitivity of Email"),
    ).not.toBeChecked();
    expect(
      screen.getByRole("button", { name: "Apply 0 selected" }),
    ).toBeDisabled();
  });
});
