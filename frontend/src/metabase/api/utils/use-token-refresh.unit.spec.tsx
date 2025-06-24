import { setupPropertiesEndpoints } from "__support__/server-mocks";
import { act, renderWithProviders, screen, waitFor } from "__support__/ui";
import { findRequests } from "__support__/utils";
import { createMockSettings } from "metabase-types/api/mocks";

import { useGetSettingsQuery } from "../session";

import { useTokenRefresh } from "./use-token-refresh";

const TestComponent = () => {
  useTokenRefresh();
  const { isFetching } = useGetSettingsQuery();

  if (isFetching) {
    return <div>Loading...</div>;
  }

  return <div>Test</div>;
};

const waitForElevenSeconds = async () => {
  act(() => {
    jest.advanceTimersByTime(11 * 1000);
  });
  await screen.findByText("Test");
};

const setupRefreshableProperties = (hasRefresh = true) => {
  const settings = createMockSettings({
    "site-name": "Test",
    "token-status": {
      valid: true,
      status: "Token is Valid.",
      features: hasRefresh ? ["refresh-token-features"] : [],
    },
  });
  setupPropertiesEndpoints(settings);
};

const setup = async (hasRefresh = true) => {
  setupRefreshableProperties(hasRefresh);
  renderWithProviders(<TestComponent />);
  await screen.findByText("Loading...");
  await screen.findByText("Test");
  return waitForGets(1);
};

const waitForGets = async (count: number) => {
  return waitFor(async () => {
    const gets = await findRequests("GET");
    expect(gets.length).toBe(count);
  });
};

describe("useTokenRefresh", () => {
  beforeAll(() => {
    jest.useFakeTimers({ advanceTimers: true });
  });

  it("should refetch every 10 seconds", async () => {
    await setup(true); // always start with 1 request
    await waitForElevenSeconds(); // 2
    expect((await findRequests("GET")).length).toBe(2);
    await waitForElevenSeconds(); // 3
    await waitForElevenSeconds(); // 4
    await waitForGets(4);
    expect((await findRequests("GET")).length).toBe(4);
  });

  it("should not refetch if the token lacks a refresh flag", async () => {
    await setup(false);
    await waitForElevenSeconds();
    await waitForElevenSeconds();
    await waitForElevenSeconds();
    const gets = await findRequests("GET");
    expect(gets.length).toBe(1);
  });

  it("should stop refetching once the token gets a refresh flag", async () => {
    await setup(true); // always start with 1 request

    await waitForElevenSeconds();
    await waitForGets(2);

    setupRefreshableProperties(false); // remove the refresh flag
    await waitForElevenSeconds();
    await waitForGets(3); // should get one more

    await waitForElevenSeconds();
    await waitForElevenSeconds();

    const gets = await findRequests("GET"); // should still be 3
    expect(gets.length).toBe(3);
  });
});
