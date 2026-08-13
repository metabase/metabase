import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { screen, waitFor } from "__support__/ui";
import { executeAction } from "embedding-sdk-bundle/lib/execute-action";
import { getLoginStatus } from "embedding-sdk-bundle/store/selectors";
import { renderWithSDKProviders } from "embedding-sdk-bundle/test/__support__/ui";
import { createMockSdkConfig } from "embedding-sdk-bundle/test/mocks/config";
import { setupSdkState } from "embedding-sdk-bundle/test/server-mocks/sdk-init";
import type { SdkActionId } from "embedding-sdk-bundle/types/action";

import { useAction } from "./use-action";

const TEST_ACTION_ID = 42;
const EXECUTE_PATH = `path:/api/action/${TEST_ACTION_ID}/execute`;

describe("useAction", () => {
  it("exposes the hook surface in its initial idle state", () => {
    setup();

    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(screen.getByTestId("result")).toHaveTextContent("null");
    expect(screen.getByTestId("error")).toHaveTextContent("null");
  });

  it("populates result on a successful execute", async () => {
    const { onResolved } = setup({ body: { "rows-affected": 7 } });

    await userEvent.click(screen.getByText("execute"));

    await waitFor(() =>
      expect(screen.getByTestId("result")).toHaveTextContent(
        '"rows-affected":7',
      ),
    );
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
    expect(screen.getByTestId("error")).toHaveTextContent("null");
    expect(onResolved).toHaveBeenCalledWith({ "rows-affected": 7 });
    expect(fetchMock.callHistory.calls(EXECUTE_PATH)).toHaveLength(1);
  });

  it("populates error and leaves result null on failure", async () => {
    setup({ status: 403, body: { message: "denied" } });

    await userEvent.click(screen.getByText("execute"));

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent("denied"),
    );
    expect(screen.getByTestId("result")).toHaveTextContent("null");
    expect(screen.getByTestId("status")).toHaveTextContent("idle");
  });

  it("clears result and error when reset is called", async () => {
    setup({ body: { "rows-affected": 7 } });

    await userEvent.click(screen.getByText("execute"));
    await waitFor(() =>
      expect(screen.getByTestId("result")).toHaveTextContent(
        '"rows-affected":7',
      ),
    );

    await userEvent.click(screen.getByText("reset"));

    expect(screen.getByTestId("result")).toHaveTextContent("null");
    expect(screen.getByTestId("error")).toHaveTextContent("null");
  });

  it("resolves to null and skips the request when actionId is null", async () => {
    const { onResolved } = setup({ actionId: null });

    await userEvent.click(screen.getByText("execute"));

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(null));
    expect(fetchMock.callHistory.calls(EXECUTE_PATH)).toHaveLength(0);
  });

  it("resolves to null when the SDK bundle has not loaded", async () => {
    const { onResolved } = setup({ bundleLoaded: false });

    await userEvent.click(screen.getByText("execute"));

    await waitFor(() => expect(onResolved).toHaveBeenCalledWith(null));
    expect(fetchMock.callHistory.calls(EXECUTE_PATH)).toHaveLength(0);
  });

  it("accepts an entity_id string as actionId and routes the call to /api/action/:eid/execute", async () => {
    const ENTITY_ID = "abc123def456abc123def";
    const eidPath = `path:/api/action/${ENTITY_ID}/execute`;
    fetchMock.post(eidPath, { status: 200, body: { "rows-affected": 1 } });

    const { onResolved } = setup({ actionId: ENTITY_ID });

    await userEvent.click(screen.getByText("execute"));

    await waitFor(() =>
      expect(onResolved).toHaveBeenCalledWith({ "rows-affected": 1 }),
    );
    expect(fetchMock.callHistory.calls(eidPath)).toHaveLength(1);
    expect(fetchMock.callHistory.calls(EXECUTE_PATH)).toHaveLength(0);
  });
});

type SetupProps = {
  actionId?: SdkActionId | null;
  status?: number;
  body?: Record<string, unknown>;
  bundleLoaded?: boolean;
};

function setup({
  actionId = TEST_ACTION_ID,
  status = 200,
  body = { "rows-affected": 7 },
  bundleLoaded = true,
}: SetupProps = {}) {
  fetchMock.post(EXECUTE_PATH, { status, body });

  const onResolved = jest.fn();
  const { state } = setupSdkState();

  renderWithSDKProviders(
    <TestComponent actionId={actionId} onResolved={onResolved} />,
    {
      metabaseEmbeddingSdkBundleExports: bundleLoaded
        ? { executeAction, getLoginStatus }
        : undefined,
      storeInitialState: state,
      componentProviderProps: {
        authConfig: createMockSdkConfig(),
      },
    },
  );

  return { onResolved };
}

const TestComponent = ({
  actionId,
  onResolved,
}: {
  actionId: SdkActionId | null;
  onResolved: (value: unknown) => void;
}) => {
  const { execute, isExecuting, result, error, reset } = useAction<{
    amount: number;
  }>(actionId);

  const onExecute = async () => {
    try {
      onResolved(await execute({ amount: 1 }));
    } catch {
      // captured into error state; the test reads from there
    }
  };

  return (
    <div>
      <button onClick={onExecute}>execute</button>
      <button onClick={reset}>reset</button>
      <div data-testid="status">{isExecuting ? "executing" : "idle"}</div>
      <div data-testid="result">{result ? JSON.stringify(result) : "null"}</div>
      <div data-testid="error">
        {error ? (error.data.message ?? "") : "null"}
      </div>
    </div>
  );
};
