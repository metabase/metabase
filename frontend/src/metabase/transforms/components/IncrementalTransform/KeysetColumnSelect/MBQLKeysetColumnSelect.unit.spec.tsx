import fetchMock from "fetch-mock";

import { setupAdhocQueryMetadataEndpoint } from "__support__/server-mocks";
import { renderWithProviders, waitFor } from "__support__/ui";
import { WorktreeProvider } from "metabase/common/worktrees";
import { FormProvider } from "metabase/forms";
import * as Lib from "metabase-lib";
import { SAMPLE_PROVIDER } from "metabase-lib/test-helpers";
import type { TransformSource, WorktreeId } from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockStructuredDatasetQuery,
} from "metabase-types/api/mocks";
import { ORDERS_ID } from "metabase-types/api/mocks/presets";

import { getInitialValues } from "../form";

import { MBQLKeysetColumnSelect } from "./MBQLKeysetColumnSelect";

type SetupOpts = {
  worktreeId?: WorktreeId;
};

function setup({ worktreeId }: SetupOpts = {}) {
  setupAdhocQueryMetadataEndpoint(createMockCardQueryMetadata());

  const datasetQuery = createMockStructuredDatasetQuery();
  const source: TransformSource = { type: "query", query: datasetQuery };
  const query = Lib.createTestQuery(SAMPLE_PROVIDER, {
    stages: [{ source: { type: "table", id: ORDERS_ID } }],
  });

  const select = (
    <FormProvider initialValues={getInitialValues()} onSubmit={jest.fn()}>
      <MBQLKeysetColumnSelect
        source={source}
        name="checkpointFilterFieldId"
        label="Merge key"
        placeholder="Pick a column"
        description="Column used as the checkpoint"
        query={query}
      />
    </FormProvider>
  );

  renderWithProviders(
    worktreeId !== undefined ? (
      <WorktreeProvider worktreeId={worktreeId}>{select}</WorktreeProvider>
    ) : (
      select
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

describe("MBQLKeysetColumnSelect", () => {
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
