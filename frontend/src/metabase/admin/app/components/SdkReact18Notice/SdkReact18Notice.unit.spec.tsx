import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupSdkReact18HostsEndpoint,
  setupUserKeyValueEndpoints,
} from "__support__/server-mocks";
import { createMockState } from "__support__/state";
import { renderWithProviders, screen } from "__support__/ui";
import type { SdkReact18Host } from "metabase-types/api";
import { createMockUser } from "metabase-types/api/mocks";

import { SdkReact18Notice } from "./SdkReact18Notice";

const HOSTS_PATH = "path:/api/embedding-sdk/react-18-hosts";
const ACKNOWLEDGEMENT_PATH =
  "path:/api/user-key-value/namespace/user_acknowledgement/key/sdk-react-18-notice";

interface SetupOpts {
  hosts: SdkReact18Host[];
  isAdmin?: boolean;
  isDismissed?: boolean;
}

function createHost(host: Partial<SdkReact18Host>): SdkReact18Host {
  return {
    id: 1,
    host: "app.example.com",
    created_at: "2026-10-01T10:00:00Z",
    last_seen_at: "2026-10-13T10:00:00Z",
    ...host,
  };
}

function setup({ hosts, isAdmin = true, isDismissed = false }: SetupOpts) {
  setupSdkReact18HostsEndpoint(hosts);
  setupUserKeyValueEndpoints({
    namespace: "user_acknowledgement",
    key: "sdk-react-18-notice",
    value: isDismissed,
  });

  renderWithProviders(<SdkReact18Notice />, {
    storeInitialState: createMockState({
      currentUser: createMockUser({ is_superuser: isAdmin }),
    }),
  });
}

async function waitForRequests() {
  await act(async () => {
    await fetchMock.callHistory.flush(true);
    // RTK Query batches subscriber updates on a timer.
    await jest.runOnlyPendingTimersAsync();
  });
}

describe("SdkReact18Notice", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("lists the host apps that use React 18", async () => {
    setup({
      hosts: [
        createHost({ id: 2, host: "app.example.com" }),
        createHost({ id: 1, host: null }),
      ],
    });

    const notice = await screen.findByRole("status");
    expect(notice).toHaveTextContent("Update host apps to React 19");
    expect(notice).toHaveTextContent("app.example.com");
    expect(notice).toHaveTextContent("Unknown host app");
    expect(
      screen.getByRole("link", { name: "Learn more" }),
    ).toBeInTheDocument();
  });

  it("hides the notice for good when the admin dismisses it", async () => {
    setup({ hosts: [createHost({})] });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(
      await screen.findByRole("button", { name: "Dismiss warning" }),
    );
    await waitForRequests();

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    const [request] = fetchMock.callHistory.calls(ACKNOWLEDGEMENT_PATH, {
      method: "PUT",
    });
    expect(request?.options?.body).toBe(JSON.stringify({ value: true }));
  });

  it("renders nothing when the admin already dismissed it", async () => {
    setup({ hosts: [createHost({})], isDismissed: true });

    await waitForRequests();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(fetchMock.callHistory.called(HOSTS_PATH)).toBe(false);
  });

  it("renders nothing for non-admins", async () => {
    setup({ hosts: [createHost({})], isAdmin: false });

    await waitForRequests();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(fetchMock.callHistory.called(HOSTS_PATH)).toBe(false);
  });

  it("renders nothing when no host app uses React 18", async () => {
    setup({ hosts: [] });

    await waitForRequests();
    expect(fetchMock.callHistory.called(HOSTS_PATH)).toBe(true);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
