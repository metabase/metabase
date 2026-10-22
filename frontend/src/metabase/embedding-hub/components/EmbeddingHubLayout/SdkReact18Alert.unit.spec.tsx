import { act } from "@testing-library/react";
import fetchMock from "fetch-mock";

import { setupSdkReact18HostsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { SdkReact18Host } from "metabase-types/api";

import { SdkReact18Alert } from "./SdkReact18Alert";

interface SetupOpts {
  hosts: SdkReact18Host[];
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

function setup({ hosts }: SetupOpts) {
  setupSdkReact18HostsEndpoint(hosts);
  renderWithProviders(<SdkReact18Alert />);
}

async function waitForRequests() {
  await act(async () => {
    await fetchMock.callHistory.flush(true);
    // RTK Query batches subscriber updates on a timer.
    await jest.runOnlyPendingTimersAsync();
  });
}

describe("SdkReact18Alert", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("warns about React 18 and lists the host apps", async () => {
    setup({
      hosts: [
        createHost({ id: 3, host: "app.example.com" }),
        createHost({ id: 2, host: "admin.example.com" }),
        createHost({ id: 1, host: null }),
      ],
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Update host apps to React 19");
    expect(within(alert).getByText("app.example.com")).toBeInTheDocument();
    expect(within(alert).getByText("admin.example.com")).toBeInTheDocument();
    expect(within(alert).getByText("Unknown host app")).toBeInTheDocument();
    expect(
      within(alert).getByRole("link", { name: "Learn more" }),
    ).toBeInTheDocument();
  });

  it("renders nothing when no host application uses React 18", async () => {
    setup({ hosts: [] });

    await waitForRequests();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
