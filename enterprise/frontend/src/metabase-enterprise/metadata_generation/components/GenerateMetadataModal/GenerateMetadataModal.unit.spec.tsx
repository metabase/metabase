import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupGetMetadataGenerationRunEndpoint,
  setupMetadataGenerationEstimateEndpoint,
  setupStartMetadataGenerationRunEndpoint,
  setupStartMetadataGenerationRunErrorEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  ConcreteTableId,
  MetadataGenerationEstimate,
} from "metabase-types/api";
import {
  createMockDatabase,
  createMockMetadataGenerationEstimate,
  createMockMetadataGenerationRun,
  createMockTable,
} from "metabase-types/api/mocks";

import { GenerateMetadataModal } from "./GenerateMetadataModal";

const DATABASE = createMockDatabase({
  id: 1,
  tables: [
    createMockTable({
      id: 10,
      db_id: 1,
      schema: "public",
      display_name: "Orders",
    }),
    createMockTable({
      id: 11,
      db_id: 1,
      schema: "public",
      display_name: "People",
    }),
  ],
});

const RUN = createMockMetadataGenerationRun({ id: 7, total_tables: 2 });

const START_URL = "path:/api/ee/data-sensitivity/runs";
const ESTIMATE_URL = "path:/api/ee/data-sensitivity/runs/estimate";

type SetupOpts = {
  estimate?: MetadataGenerationEstimate;
  initialTableIds?: ConcreteTableId[];
  startError?: { status: number; message: string };
};

function setup({
  estimate = createMockMetadataGenerationEstimate(),
  initialTableIds,
  startError,
}: SetupOpts = {}) {
  fetchMock.get(`path:/api/database/${DATABASE.id}/metadata`, DATABASE);
  setupMetadataGenerationEstimateEndpoint(estimate);
  if (startError) {
    setupStartMetadataGenerationRunErrorEndpoint(
      startError.status,
      startError.message,
    );
  } else {
    setupStartMetadataGenerationRunEndpoint(RUN);
  }
  setupGetMetadataGenerationRunEndpoint(RUN);

  const onClose = jest.fn();
  renderWithProviders(
    <GenerateMetadataModal
      databaseId={DATABASE.id}
      initialTableIds={initialTableIds}
      opened
      onClose={onClose}
    />,
  );
  return { onClose };
}

function getStartButton() {
  return screen.getByRole("button", { name: "Start" });
}

describe("GenerateMetadataModal", () => {
  it("shows the estimate for the whole database with the default attributes", async () => {
    setup();

    expect(
      await screen.findByTestId("generate-metadata-estimate"),
    ).toHaveTextContent("10 tables, 200 fields");
    expect(screen.getByRole("radio", { name: "Whole database" })).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Data sensitivity" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Semantic type" }),
    ).toBeChecked();
    expect(
      screen.getByRole("checkbox", { name: "Description" }),
    ).not.toBeChecked();

    const url = new URL(
      fetchMock.callHistory.lastCall(ESTIMATE_URL)?.url ?? "",
    );
    expect(url.searchParams.get("database-id")).toBe("1");
    expect(url.searchParams.getAll("attributes")).toEqual([
      "data_sensitivity",
      "semantic_type",
    ]);
  });

  it("starts a run and shows its progress", async () => {
    setup();

    await waitFor(() => expect(getStartButton()).toBeEnabled());
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Description" }),
    );
    await waitFor(() => expect(getStartButton()).toBeEnabled());
    await userEvent.click(getStartButton());

    await waitFor(async () => {
      expect(
        await fetchMock.callHistory
          .lastCall(START_URL, { method: "POST" })
          ?.request?.json(),
      ).toEqual({
        database_id: 1,
        attributes: ["data_sensitivity", "semantic_type", "description"],
      });
    });
    expect(
      await screen.findByTestId("metadata-generation-run"),
    ).toBeInTheDocument();
    expect(screen.getByText("Generating metadata")).toBeInTheDocument();
  });

  it("scopes the run to the given tables", async () => {
    setup({ initialTableIds: [10] });

    expect(screen.getByRole("radio", { name: "Tables" })).toBeChecked();
    await waitFor(() => expect(getStartButton()).toBeEnabled());
    await userEvent.click(getStartButton());

    await waitFor(async () => {
      expect(
        await fetchMock.callHistory
          .lastCall(START_URL, { method: "POST" })
          ?.request?.json(),
      ).toEqual({
        database_id: 1,
        table_ids: [10],
        attributes: ["data_sensitivity", "semantic_type"],
      });
    });
  });

  it("cannot start without an attribute", async () => {
    setup();

    await waitFor(() => expect(getStartButton()).toBeEnabled());
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Data sensitivity" }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: "Semantic type" }),
    );

    expect(getStartButton()).toBeDisabled();
    expect(
      screen.getByText("Pick what to generate and where."),
    ).toBeInTheDocument();
  });

  it("cannot start when AI generation is not available", async () => {
    setup({
      estimate: createMockMetadataGenerationEstimate({
        unavailable_reason: "metabot-disabled",
      }),
    });

    expect(
      await screen.findByText(
        "Metabot is disabled. Enable Metabot to generate metadata.",
      ),
    ).toBeInTheDocument();
    expect(getStartButton()).toBeDisabled();
  });

  it("shows why a start failed", async () => {
    setup({
      startError: {
        status: 409,
        message:
          "A metadata generation run is already active for this database.",
      },
    });

    await waitFor(() => expect(getStartButton()).toBeEnabled());
    await userEvent.click(getStartButton());

    expect(
      await screen.findByText(
        "A metadata generation run is already active for this database.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("metadata-generation-run"),
    ).not.toBeInTheDocument();
  });
});
