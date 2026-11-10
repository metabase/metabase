import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupListMetadataGenerationProposalsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { MetadataGenerationProposal } from "metabase-types/api";
import {
  createMockMetadataGenerationProposal,
  createMockUser,
} from "metabase-types/api/mocks";

import { PendingBadge } from "./PendingBadge";

const TABLE_ID = 10;

const PROPOSALS = [
  createMockMetadataGenerationProposal({
    id: 1,
    table_id: TABLE_ID,
    field_id: 100,
    attribute: "data_sensitivity",
    proposed_value: "PII",
  }),
  createMockMetadataGenerationProposal({
    id: 2,
    table_id: TABLE_ID,
    field_id: 100,
    attribute: "semantic_type",
    source: "human",
    proposed_value: "type/Email",
  }),
  createMockMetadataGenerationProposal({
    id: 3,
    table_id: TABLE_ID,
    field_id: 101,
    attribute: "description",
    proposed_value: "The order total",
  }),
];

function setup({
  fieldId,
  isPreview = false,
  isAdmin = true,
  proposals = PROPOSALS,
}: {
  fieldId?: number;
  isPreview?: boolean;
  isAdmin?: boolean;
  proposals?: MetadataGenerationProposal[];
} = {}) {
  const onPreviewChange = jest.fn();
  setupListMetadataGenerationProposalsEndpoint(TABLE_ID, proposals);
  renderWithProviders(
    <PendingBadge
      tableId={TABLE_ID}
      fieldId={fieldId}
      isPreview={isPreview}
      onPreviewChange={onPreviewChange}
    />,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: isAdmin }),
      },
    },
  );
  return { onPreviewChange };
}

describe("PendingBadge", () => {
  it("counts the pending suggestions of the table", async () => {
    setup();

    expect(await screen.findByText("3 AI suggestions")).toBeInTheDocument();
  });

  it("counts the pending suggestions of the field only", async () => {
    setup({ fieldId: 100 });

    expect(await screen.findByText("2 AI suggestions")).toBeInTheDocument();
  });

  it("turns the preview on and off", async () => {
    const { onPreviewChange } = setup({ fieldId: 101 });

    await userEvent.click(
      await screen.findByRole("switch", { name: "Preview the AI suggestions" }),
    );

    expect(onPreviewChange).toHaveBeenCalledWith(true);
  });

  it("shows the preview as on when it is on", async () => {
    setup({ fieldId: 101, isPreview: true });

    expect(
      await screen.findByRole("switch", { name: "Preview the AI suggestions" }),
    ).toBeChecked();
  });

  it("shows nothing for a field without pending suggestions", async () => {
    setup({ fieldId: 102 });

    await waitFor(() => {
      expect(
        fetchMock.callHistory.called("path:/api/ee/data-sensitivity/proposals"),
      ).toBe(true);
    });
    expect(
      screen.queryByTestId("metadata-generation-pending"),
    ).not.toBeInTheDocument();
  });

  it("shows nothing to a person who is not an admin", () => {
    setup({ isAdmin: false });

    expect(
      screen.queryByTestId("metadata-generation-pending"),
    ).not.toBeInTheDocument();
  });
});
