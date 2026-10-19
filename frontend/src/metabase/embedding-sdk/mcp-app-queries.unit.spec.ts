import {
  type McpUiAuth,
  refreshMcpCredential,
  setMcpCredentialRefresher,
} from "./mcp-app-queries";

const setup = () => {
  let count = 0;
  const refresher = jest.fn(
    async (): Promise<McpUiAuth> => ({
      credential: `credential-${++count}`,
      sessionId: "s-1",
    }),
  );
  setMcpCredentialRefresher(refresher);

  return { refresher };
};

describe("refreshMcpCredential", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    setMcpCredentialRefresher(null);
    jest.useRealTimers();
  });

  it("hands every caller in the next ten seconds the credential one refresh got, so a server that keeps refusing fresh credentials cannot make the iframe mint in a loop", async () => {
    const { refresher } = setup();

    await expect(refreshMcpCredential()).resolves.toMatchObject({
      credential: "credential-1",
    });
    jest.advanceTimersByTime(9_000);
    await expect(refreshMcpCredential()).resolves.toMatchObject({
      credential: "credential-1",
    });
    expect(refresher).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(2_000);
    await expect(refreshMcpCredential()).resolves.toMatchObject({
      credential: "credential-2",
    });
    expect(refresher).toHaveBeenCalledTimes(2);
  });

  it("refreshes again once a new refresher is set", async () => {
    const { refresher } = setup();

    await refreshMcpCredential();
    setMcpCredentialRefresher(refresher);
    await refreshMcpCredential();

    expect(refresher).toHaveBeenCalledTimes(2);
  });

  it("rejects when no refresher is set", async () => {
    await expect(refreshMcpCredential()).rejects.toThrow(/refresher/);
  });
});
