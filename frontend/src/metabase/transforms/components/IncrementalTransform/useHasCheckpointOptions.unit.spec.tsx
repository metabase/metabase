import fetchMock from "fetch-mock";

import { setupAdhocQueryMetadataEndpoint } from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import { WorktreeProvider } from "metabase/common/worktrees";
import type { TransformSource, WorktreeId } from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";

import { useHasCheckpointOptions } from "./useHasCheckpointOptions";

function TestComponent({ source }: { source: TransformSource }) {
  useHasCheckpointOptions(source);
  return null;
}

type SetupOpts = {
  worktreeId?: WorktreeId;
};

function setup({ worktreeId }: SetupOpts = {}) {
  setupAdhocQueryMetadataEndpoint(createMockCardQueryMetadata());

  const datasetQuery = createMockStructuredDatasetQuery();
  const source: TransformSource = { type: "query", query: datasetQuery };

  renderWithProviders(
    worktreeId !== undefined ? (
      <WorktreeProvider worktreeId={worktreeId}>
        <TestComponent source={source} />
      </WorktreeProvider>
    ) : (
      <TestComponent source={source} />
    ),
  );

  return { datasetQuery };
}

async function getMetadataRequestBody() {
  await waitFor(() => {
    expect(
      fetchMock.callHistory.lastCall("path:/api/dataset/query_metadata"),
    ).toBeTruthy();
  });
  return fetchMock.callHistory
    .lastCall("path:/api/dataset/query_metadata")
    ?.request?.json();
}

describe("useHasCheckpointOptions", () => {
  it("scopes the metadata request to the worktree", async () => {
    const { datasetQuery } = setup({ worktreeId: 7 });

    const body = await getMetadataRequestBody();
    expect(body).toEqual({ ...datasetQuery, worktree_id: 7 });
  });

  it("requests unscoped metadata outside a worktree", async () => {
    const { datasetQuery } = setup();

    const body = await getMetadataRequestBody();
    expect(body).toEqual(datasetQuery);
    expect(body).not.toHaveProperty("worktree_id");
  });
});
