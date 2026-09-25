import fetchMock from "fetch-mock";

import {
  setupListGraphNodeDependentsEndpoint,
  setupTableEndpoints,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type {
  DependencyNode,
  SourceReplacementCheckInfo,
} from "metabase-types/api";
import {
  createMockCardDependencyNode,
  createMockCheckReplaceSourceInfo,
  createMockReplaceSourceColumnMapping,
  createMockTable,
} from "metabase-types/api/mocks";

import { SourceReplacementModal } from "./SourceReplacementModal";

const SOURCE_TABLE = createMockTable({ id: 1, display_name: "Source Table" });
const TARGET_TABLE = createMockTable({ id: 2, display_name: "Target Table" });

type SetupOpts = {
  checkInfo: SourceReplacementCheckInfo;
  dependents: DependencyNode[];
};

function setup({ checkInfo, dependents }: SetupOpts) {
  setupTableEndpoints(SOURCE_TABLE);
  setupTableEndpoints(TARGET_TABLE);
  setupListGraphNodeDependentsEndpoint(dependents);
  // Dependents resolve before the check, so a blocked state can only come from the check result.
  fetchMock.post("path:/api/ee/replacement/check-replace-source", checkInfo, {
    delay: 100,
  });

  renderWithProviders(
    <SourceReplacementModal
      initialSource={{ id: SOURCE_TABLE.id, type: "table" }}
      initialTarget={{ id: TARGET_TABLE.id, type: "table" }}
      triggeredFrom="table_list"
      opened
      onClose={jest.fn()}
    />,
  );
}

async function waitForDependents() {
  await waitFor(() =>
    expect(
      fetchMock.callHistory.called(
        "path:/api/ee/dependencies/graph/dependents",
      ),
    ).toBe(true),
  );
}

function getSubmitButton() {
  return screen.getByRole("button", { name: /Replace data source/ });
}

const COLUMN_MAPPINGS = [createMockReplaceSourceColumnMapping()];

const DEPENDENTS = [
  createMockCardDependencyNode({ id: 10 }),
  createMockCardDependencyNode({ id: 11 }),
];

describe("SourceReplacementModal", () => {
  it("enables the replacement when the check passes and the source has dependents", async () => {
    setup({
      checkInfo: createMockCheckReplaceSourceInfo({
        success: true,
        column_mappings: COLUMN_MAPPINGS,
      }),
      dependents: DEPENDENTS,
    });

    expect(
      await screen.findByRole("tab", { name: "2 items will be changed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Replace data source in 2 items" }),
    ).toBeEnabled();
  });

  it("blocks the replacement when the source table is referenced by a foreign key", async () => {
    setup({
      checkInfo: createMockCheckReplaceSourceInfo({
        success: false,
        errors: ["incompatible-implicit-joins"],
        column_mappings: COLUMN_MAPPINGS,
      }),
      dependents: DEPENDENTS,
    });

    expect(
      await screen.findByText(
        "The original table can't be referenced by a foreign key by another table.",
      ),
    ).toBeInTheDocument();
    await waitForDependents();
    expect(getSubmitButton()).toBeDisabled();
    expect(
      screen.queryByRole("tab", { name: /will be changed/ }),
    ).not.toBeInTheDocument();
  });

  it("blocks the replacement when the source table has a sandbox policy", async () => {
    setup({
      checkInfo: createMockCheckReplaceSourceInfo({
        success: false,
        errors: ["affects-gtap-policies"],
        column_mappings: COLUMN_MAPPINGS,
      }),
      dependents: DEPENDENTS,
    });

    expect(
      await screen.findByText(
        "This table has row or column security policies that block this replacement.",
      ),
    ).toBeInTheDocument();
    await waitForDependents();
    expect(getSubmitButton()).toBeDisabled();
    expect(
      screen.queryByRole("tab", { name: /will be changed/ }),
    ).not.toBeInTheDocument();
  });

  it("blocks the replacement when nothing uses the source even though the check passes", async () => {
    setup({
      checkInfo: createMockCheckReplaceSourceInfo({
        success: true,
        column_mappings: COLUMN_MAPPINGS,
      }),
      dependents: [],
    });

    expect(
      await screen.findByRole("tab", { name: "Column comparison" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        "Nothing uses this data source, so there's nothing to replace.",
      ),
    ).toBeInTheDocument();
    expect(getSubmitButton()).toBeDisabled();
    expect(
      screen.queryByRole("tab", { name: /will be changed/ }),
    ).not.toBeInTheDocument();
  });
});
