import userEvent from "@testing-library/user-event";
import fetchMock from "fetch-mock";

import {
  setupSessionCountsEndpoint,
  setupSessionCountsErrorEndpoint,
} from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor, within } from "__support__/ui";
import type { SessionCountsResponse } from "metabase-types/api";

import type { SessionsTab } from "../SessionsPage/types";

import { SessionsTabs } from "./SessionsTabs";

interface SetupOpts {
  tab?: SessionsTab;
  counts?: SessionCountsResponse;
  error?: boolean;
  delay?: number;
}

function setup({
  tab = "active",
  counts = { active: 137, ended: 0 },
  error = false,
  delay,
}: SetupOpts = {}) {
  if (error) {
    setupSessionCountsErrorEndpoint();
  } else {
    setupSessionCountsEndpoint(counts, { delay });
  }
  const onChange = jest.fn<void, [SessionsTab]>();
  renderWithProviders(<SessionsTabs tab={tab} onChange={onChange} />, {
    withRouter: true,
  });
  return { onChange };
}

const getTab = (name: string) => screen.getByRole("button", { name });
const getCountCalls = () =>
  fetchMock.callHistory.calls("path:/api/ee/session-management/counts");

describe("SessionsTabs", () => {
  it("shows exact counts, including zero, without loading the inactive session table", async () => {
    setup();

    expect(
      await within(getTab("Active")).findByText("137"),
    ).toBeInTheDocument();
    expect(within(getTab("Ended")).getByText("0")).toBeInTheDocument();
    expect(getCountCalls()).toHaveLength(1);
    expect(new URL(getCountCalls()[0].url).search).toBe("");
    expect(
      fetchMock.callHistory.calls("path:/api/ee/session-management"),
    ).toHaveLength(0);
  });

  it("keeps tabs interactive while their counters are loading", async () => {
    const { onChange } = setup({ delay: 100 });

    expect(
      within(getTab("Active")).getByTestId("tab-count-skeleton"),
    ).toBeInTheDocument();
    expect(
      within(getTab("Ended")).getByTestId("tab-count-skeleton"),
    ).toBeInTheDocument();
    await userEvent.click(getTab("Ended"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("ended");
    expect(
      await within(getTab("Active")).findByText("137"),
    ).toBeInTheDocument();
  });

  it("omits failed counters without removing the session tabs", async () => {
    setup({ error: true });

    await waitFor(() => {
      expect(getCountCalls()).toHaveLength(1);
      expect(
        fetchMock.callHistory.done("path:/api/ee/session-management/counts"),
      ).toBe(true);
      expect(screen.queryAllByTestId("tab-count-skeleton")).toHaveLength(0);
    });
    expect(within(getTab("Active")).queryByText(/\d/)).not.toBeInTheDocument();
    expect(within(getTab("Ended")).queryByText(/\d/)).not.toBeInTheDocument();
  });

  it("marks the selected session population as the current page", () => {
    setup({ tab: "ended" });
    expect(screen.getByRole("button", { name: "Ended" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("button", { name: "Active" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("passes the selected session tab to the URL-state owner", async () => {
    const { onChange } = setup();
    await userEvent.click(screen.getByRole("button", { name: "Ended" }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("ended");
  });
});
