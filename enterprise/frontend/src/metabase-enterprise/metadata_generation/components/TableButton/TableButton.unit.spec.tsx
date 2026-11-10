import userEvent from "@testing-library/user-event";

import {
  setupGetMetadataGenerationRunEndpoint,
  setupListMetadataGenerationProposalsEndpoint,
  setupListMetadataGenerationRunsEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen } from "__support__/ui";
import type { MetadataGenerationRun } from "metabase-types/api";
import {
  createMockMetadataGenerationProposal,
  createMockMetadataGenerationRun,
  createMockTable,
  createMockUser,
} from "metabase-types/api/mocks";

import { RUN_POLLING_INTERVAL } from "../../utils";
import { PendingBadge } from "../PendingBadge";

import { TableButton } from "./TableButton";

const TABLE_ID = 10;
const TABLE = createMockTable({ id: TABLE_ID, db_id: 1 });

const ACTIVE_RUN = createMockMetadataGenerationRun({
  id: 7,
  database_id: TABLE.db_id,
  scope: { type: "tables", table_ids: [TABLE_ID] },
  status: "running",
  total_tables: 1,
  done_tables: 0,
});

const ENDED_RUN: MetadataGenerationRun = {
  ...ACTIVE_RUN,
  status: "succeeded",
  is_active: null,
  done_tables: 1,
  ended_at: "2026-10-09T00:10:00Z",
};

const PROPOSAL = createMockMetadataGenerationProposal({
  id: 1,
  table_id: TABLE_ID,
  field_id: 100,
  attribute: "data_sensitivity",
  proposed_value: "PII",
});

type SetupOpts = {
  runs: MetadataGenerationRun[];
};

function setup({ runs }: SetupOpts) {
  setupListMetadataGenerationRunsEndpoint(runs);
  setupGetMetadataGenerationRunEndpoint(ACTIVE_RUN);
  setupListMetadataGenerationProposalsEndpoint(TABLE_ID, []);
  renderWithProviders(
    <>
      <TableButton table={TABLE} />
      <PendingBadge
        tableId={TABLE_ID}
        isPreview={false}
        onPreviewChange={jest.fn()}
      />
    </>,
    {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: true }),
      },
    },
  );
}

describe("TableButton", () => {
  it("opens the progress of the active run of the database", async () => {
    setup({ runs: [ACTIVE_RUN] });

    await userEvent.click(
      await screen.findByRole("button", { name: "Generating field metadata…" }),
    );

    expect(
      await screen.findByTestId("metadata-generation-run"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Start" }),
    ).not.toBeInTheDocument();
  });

  it("shows the pending suggestions when the active run ends", async () => {
    setup({ runs: [ACTIVE_RUN] });
    expect(
      await screen.findByRole("button", { name: "Generating field metadata…" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("metadata-generation-pending"),
    ).not.toBeInTheDocument();

    setupListMetadataGenerationRunsEndpoint([ENDED_RUN]);
    setupListMetadataGenerationProposalsEndpoint(TABLE_ID, [PROPOSAL]);

    expect(
      await screen.findByText(
        "1 AI suggestion",
        {},
        { timeout: RUN_POLLING_INTERVAL * 2 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Generate field metadata" }),
    ).toBeInTheDocument();
  });

  it("shows nothing to a person who is not an admin", () => {
    setupListMetadataGenerationRunsEndpoint([ACTIVE_RUN]);
    renderWithProviders(<TableButton table={TABLE} />, {
      storeInitialState: {
        currentUser: createMockUser({ is_superuser: false }),
      },
    });

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
