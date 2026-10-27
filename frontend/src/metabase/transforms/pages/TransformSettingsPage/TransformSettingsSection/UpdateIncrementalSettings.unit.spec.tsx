import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupAdhocQueryMetadataEndpoint,
  setupFieldEndpoints,
  setupGetTransformEndpoint,
  setupUpdateTransformEndpoint,
} from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { useGetTransformQuery } from "metabase/api";
import { type Deferred, defer } from "metabase/utils/promise";
import type { Transform, TransformId } from "metabase-types/api";
import {
  createMockCardQueryMetadata,
  createMockStructuredDatasetQuery,
  createMockTransform,
} from "metabase-types/api/mocks";
import {
  ORDERS,
  ORDERS_ID,
  SAMPLE_DB_ID,
  createOrdersTable,
  createSampleDatabase,
} from "metabase-types/api/mocks/presets";

import { UpdateIncrementalSettings } from "./UpdateIncrementalSettings";

const DEBOUNCE_MS = 300;
const SUCCESS_MESSAGE = "Incremental transformation settings updated";
const ERROR_MESSAGE = "Failed to update incremental transformation settings";

type UpdateResponse =
  | Transform
  | { status: number; body: { message: string } }
  | { throws: Error };

type PendingUpdate = {
  body: Partial<Transform>;
  response: Deferred<UpdateResponse>;
};

const SERVER_ERROR_RESPONSE = {
  status: 500,
  body: { message: "Internal server error" },
};

const pendingUpdates: PendingUpdate[] = [];

function TransformIncrementalSettings({
  transformId,
}: {
  transformId: TransformId;
}) {
  const { data: transform } = useGetTransformQuery(transformId);
  return transform != null ? (
    <UpdateIncrementalSettings transform={transform} />
  ) : null;
}

async function setup() {
  const transform = createMockTransform({
    source: {
      type: "query",
      query: createMockStructuredDatasetQuery({
        database: SAMPLE_DB_ID,
        query: { "source-table": ORDERS_ID },
      }),
    },
  });
  let serverTransform = transform;

  setupAdhocQueryMetadataEndpoint(
    createMockCardQueryMetadata({ databases: [createSampleDatabase()] }),
  );
  createOrdersTable().fields?.forEach((field) => setupFieldEndpoints(field));
  setupGetTransformEndpoint(transform, () => serverTransform);
  setupUpdateTransformEndpoint(transform.id, (call) => {
    const response = defer<UpdateResponse>();
    pendingUpdates.push({
      body: JSON.parse(String(call.options.body)),
      response,
    });
    return response.promise;
  });

  const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
  renderWithProviders(
    <TransformIncrementalSettings transformId={transform.id} />,
    { withUndos: true },
  );

  const incrementalSwitch = await screen.findByRole("switch", {
    name: /Only process new data/,
  });
  await waitFor(() => expect(incrementalSwitch).toBeEnabled());

  const settleNextUpdate = (
    getResponse: (body: Partial<Transform>) => UpdateResponse,
  ) =>
    act(async () => {
      const pendingUpdate = pendingUpdates.shift();
      expect(pendingUpdate).toBeDefined();
      if (pendingUpdate != null) {
        pendingUpdate.response.resolve(getResponse(pendingUpdate.body));
      }
      await jest.advanceTimersByTimeAsync(0);
    });

  return {
    user,
    incrementalSwitch,
    succeedNextUpdate: () =>
      settleNextUpdate((body) => {
        serverTransform = { ...serverTransform, ...body };
        return serverTransform;
      }),
    failNextUpdate: () => settleNextUpdate(() => SERVER_ERROR_RESPONSE),
    dropNextUpdate: () =>
      settleNextUpdate(() => ({ throws: new TypeError("Failed to fetch") })),
  };
}

function advanceTimers(ms: number) {
  return act(() => jest.advanceTimersByTimeAsync(ms));
}

function getUpdateRequestBodies() {
  return fetchMock.callHistory
    .calls("path:/api/transform/1", { method: "PUT" })
    .map((call) => JSON.parse(String(call.options.body)));
}

function getCheckpointFieldInput() {
  return screen.getByRole("textbox", {
    name: "Field to check for new values",
  });
}

async function selectCheckpointField(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(getCheckpointFieldInput());
  await user.click(await screen.findByRole("option", { name }));
}

describe("UpdateIncrementalSettings", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    pendingUpdates
      .splice(0)
      .forEach(({ response }) => response.resolve(SERVER_ERROR_RESPONSE));
    jest.useRealTimers();
  });

  it("saves incremental settings with the first checkpoint field once the debounce delay elapses", async () => {
    const { user, incrementalSwitch, succeedNextUpdate } = await setup();

    await user.click(incrementalSwitch);
    await advanceTimers(DEBOUNCE_MS - 1);
    expect(getUpdateRequestBodies()).toHaveLength(0);

    await advanceTimers(1);
    expect(getUpdateRequestBodies()).toEqual([
      expect.objectContaining({
        source: expect.objectContaining({
          "source-incremental-strategy": expect.objectContaining({
            type: "checkpoint",
            "checkpoint-filter-field-id": ORDERS.CREATED_AT,
          }),
        }),
        target: expect.objectContaining({
          type: "table-incremental",
          "target-incremental-strategy": { type: "append" },
        }),
      }),
    ]);

    await succeedNextUpdate();

    expect(await screen.findByText(SUCCESS_MESSAGE)).toBeInTheDocument();
    expect(incrementalSwitch).toBeChecked();
    expect(getCheckpointFieldInput()).toHaveValue("Created At");
  });

  it("shows the error toast and rolls back the switch together when the update fails", async () => {
    const { user, incrementalSwitch, failNextUpdate } = await setup();

    await user.click(incrementalSwitch);
    await advanceTimers(DEBOUNCE_MS);
    expect(incrementalSwitch).toBeChecked();
    expect(screen.queryByText(ERROR_MESSAGE)).not.toBeInTheDocument();

    await failNextUpdate();

    expect(incrementalSwitch).not.toBeChecked();
    expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument();
    expect(incrementalSwitch).not.toBeChecked();
  });

  it("shows the error toast and rolls back the switch together when the network fails", async () => {
    const { user, incrementalSwitch, dropNextUpdate } = await setup();

    await user.click(incrementalSwitch);
    await advanceTimers(DEBOUNCE_MS);
    expect(incrementalSwitch).toBeChecked();
    expect(screen.queryByText(ERROR_MESSAGE)).not.toBeInTheDocument();

    await dropNextUpdate();

    expect(incrementalSwitch).not.toBeChecked();
    expect(await screen.findByText(ERROR_MESSAGE)).toBeInTheDocument();
    expect(incrementalSwitch).not.toBeChecked();
  });

  it("does not save a checkpoint field picked while a failing update is in flight", async () => {
    const { user, incrementalSwitch, failNextUpdate } = await setup();

    await user.click(incrementalSwitch);
    await advanceTimers(DEBOUNCE_MS);
    await selectCheckpointField(user, "Total");
    await advanceTimers(DEBOUNCE_MS);

    await failNextUpdate();
    await advanceTimers(DEBOUNCE_MS);

    expect(getUpdateRequestBodies()).toHaveLength(1);
    expect(screen.getByText(ERROR_MESSAGE)).toBeInTheDocument();
    expect(incrementalSwitch).not.toBeChecked();
  });

  it("saves only the latest checkpoint field picked while an update is in flight", async () => {
    const { user, incrementalSwitch, succeedNextUpdate } = await setup();

    await user.click(incrementalSwitch);
    await advanceTimers(DEBOUNCE_MS);
    await selectCheckpointField(user, "Total");
    await advanceTimers(DEBOUNCE_MS);
    await selectCheckpointField(user, "Tax");
    await advanceTimers(DEBOUNCE_MS);
    expect(getUpdateRequestBodies()).toHaveLength(1);

    await succeedNextUpdate();
    expect(getUpdateRequestBodies()).toHaveLength(2);
    expect(getUpdateRequestBodies()[1]).toEqual(
      expect.objectContaining({
        source: expect.objectContaining({
          "source-incremental-strategy": expect.objectContaining({
            "checkpoint-filter-field-id": ORDERS.TAX,
          }),
        }),
      }),
    );

    await succeedNextUpdate();

    expect(getCheckpointFieldInput()).toHaveValue("Tax");
    expect(incrementalSwitch).toBeChecked();
  });
});
