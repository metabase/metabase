import { act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import { setupSdkReact18HostsEndpoint } from "__support__/server-mocks";
import { renderWithProviders, screen, within } from "__support__/ui";
import type { SdkReact18Host } from "metabase-types/api";

import { SdkReact18Alert } from "./SdkReact18Alert";

interface SetupOpts {
  hosts: SdkReact18Host[];
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

  it("warns about React 18 and lists the host apps in a modal", async () => {
    setup({
      hosts: [
        { hostname: "app.example.com", last_seen: "2026-10-13" },
        { hostname: "admin.example.com", last_seen: "2026-10-11" },
        { hostname: null, last_seen: "2026-10-10" },
      ],
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("React 18 detected");
    expect(alert).not.toHaveTextContent("app.example.com");
    expect(
      screen.getByRole("link", { name: "Learn more" }),
    ).toBeInTheDocument();

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(screen.getByRole("button", { name: "See host apps" }));

    const modal = await screen.findByRole("dialog");
    expect(
      within(modal).getByText("Host apps using React 18"),
    ).toBeInTheDocument();
    expect(within(modal).getByText("app.example.com")).toBeInTheDocument();
    expect(
      within(modal).getByText("Last seen Oct 13, 2026"),
    ).toBeInTheDocument();
    expect(within(modal).getByText("admin.example.com")).toBeInTheDocument();
    expect(
      within(modal).getByText("Last seen Oct 11, 2026"),
    ).toBeInTheDocument();
    expect(within(modal).getByText("Unknown host app")).toBeInTheDocument();
  });

  it("renders nothing when no host application uses React 18", async () => {
    setup({ hosts: [] });

    await waitForRequests();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
