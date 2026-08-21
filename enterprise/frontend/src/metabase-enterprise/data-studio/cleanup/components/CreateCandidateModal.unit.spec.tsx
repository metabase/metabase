import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCreateUsageMetadataCandidateEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { UsageMetadataCandidateDetail } from "metabase-types/api";
import { createMockStructuredDatasetQuery } from "metabase-types/api/mocks";

import { CreateCandidateModal } from "./CreateCandidateModal";

jest.mock("./CandidateDefinition", () => ({
  CandidateDefinition: () => <div>Read-only definition</div>,
}));

const candidate: UsageMetadataCandidateDetail = {
  id: 11,
  candidate_type: "measure",
  table: {
    id: 1,
    schema: "PUBLIC",
    display_name: "Orders",
    is_published: true,
    database: { id: 1, name: "Sample Database" },
  },
  display_name: "Total revenue",
  suggested_name: "Total revenue",
  suggested_description: "Sum of order totals",
  required_tables: [],
  presentation: {
    aggregation: { display_name: "Sum of Total" },
    predicates: [],
  },
  definition: createMockStructuredDatasetQuery({
    query: {
      "source-table": 1,
      aggregation: [["sum", ["field", 2, null]]],
    },
  }),
  modeling_status: "missing",
  dismissed: false,
  evidence: {
    verified_source_count: 1,
    official_source_count: 0,
    popular_source_count: 1,
    distinct_source_count: 2,
    recent_view_count: 40,
  },
  creation_blockers: [],
  sources: [],
  matches: [],
};

describe("CreateCandidateModal", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("submits only editable metadata overrides", async () => {
    setupCreateUsageMetadataCandidateEndpoint(candidate.id, { id: 99 });
    const onCreated = jest.fn();

    renderWithProviders(
      <CreateCandidateModal
        candidate={candidate}
        opened
        onClose={jest.fn()}
        onCreated={onCreated}
        onStale={jest.fn()}
      />,
    );

    const nameInput = screen.getByRole("textbox", { name: /Name/ });
    const descriptionInput = screen.getByRole("textbox", {
      name: "Description",
    });
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, "Net revenue");
    await userEvent.clear(descriptionInput);
    await userEvent.type(descriptionInput, "Revenue after discounts");
    await userEvent.click(
      screen.getByRole("button", { name: "Create Measure" }),
    );

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledWith("measure", 99);
    });
    const call = fetchMock.callHistory.lastCall(
      `path:/api/ee/data-studio/usage-metadata/candidates/${candidate.id}/create`,
    );
    expect(await call?.request?.json()).toEqual({
      name: "Net revenue",
      description: "Revenue after discounts",
    });
  });
});
