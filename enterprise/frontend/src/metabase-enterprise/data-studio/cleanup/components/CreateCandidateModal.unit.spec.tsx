import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupCreateUsageMetadataCandidateEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { UsageMetadataCandidateDetail } from "metabase-types/api";
import {
  createMockMeasure,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { CreateCandidateModal } from "./CreateCandidateModal";

jest.mock("./CandidateDefinition", () => ({
  CandidateDefinition: () => <div>Read-only definition</div>,
}));

const candidate: UsageMetadataCandidateDetail = {
  id: 11,
  candidate_type: "measure",
  table: {
    id: 1,
    db_id: 1,
    schema: "PUBLIC",
    name: "orders",
    display_name: "Orders",
    description: null,
    data_layer: null,
    data_authority: null,
    view_count: 0,
    is_published: true,
    collection_id: 2,
    database: { id: 1, name: "Sample Database" },
  },
  suggested_name: "Total revenue",
  suggested_description: "Sum of order totals",
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
    total_view_count: 40,
  },
  creation_blockers: [],
  semantic_details: {},
  dismissal: null,
  sources: [],
  matches: [],
};

describe("CreateCandidateModal", () => {
  beforeEach(() => {
    fetchMock.removeRoutes();
    fetchMock.clearHistory();
  });

  it("submits only editable metadata overrides", async () => {
    const entity = createMockMeasure({ id: 99, table_id: 1 });
    setupCreateUsageMetadataCandidateEndpoint(candidate.id, {
      candidate: { ...candidate, modeling_status: "modeled" },
      entity,
    });
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
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

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
