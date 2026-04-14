import userEvent from "@testing-library/user-event";
import dayjs from "dayjs";

import { setupTaskInfoEndpoint } from "__support__/server-mocks";
import {
  renderWithProviders,
  screen,
  waitForLoaderToBeRemoved,
} from "__support__/ui";
import { createMockState } from "metabase/redux/store/mocks";
import { createMockSettingsState } from "metabase/redux/store/mocks/settings";
import type { TaskInfo } from "metabase-types/api";
import "metabase/utils/dayjs";

import { JobSchedulePage } from "./JobSchedulePage";

function firingThisWeekAt(): string {
  return dayjs
    .tz(new Date(), "UTC")
    .startOf("isoWeek")
    .add(2, "day")
    .hour(14)
    .minute(0)
    .second(0)
    .utc()
    .toISOString();
}

function mockTaskInfo(): TaskInfo {
  return {
    scheduler: [],
    jobs: [],
    firings: [
      {
        at: firingThisWeekAt(),
        job_key: "metabase.task.example.job",
        trigger_key: "example-trigger",
        description: "Example scheduled task",
      },
    ],
    firings_meta: {
      truncations: [],
      global_cap_exhausted: false,
      max_firings_per_trigger: 400,
      max_firings_global: 25000,
    },
  };
}

function setup() {
  setupTaskInfoEndpoint(mockTaskInfo(), { delay: 10 });

  return renderWithProviders(<JobSchedulePage />, {
    storeInitialState: createMockState({
      settings: createMockSettingsState({ "report-timezone": "UTC" }),
    }),
  });
}

describe("JobSchedulePage", () => {
  it("shows the schedule grid after loading", async () => {
    setup();
    expect(screen.getByTestId("loading-indicator")).toBeInTheDocument();
    await waitForLoaderToBeRemoved();
    expect(screen.getByText("Scheduled jobs")).toBeInTheDocument();
    expect(screen.getByText(/Times shown in:/)).toBeInTheDocument();
    expect(screen.getByText(/UTC/)).toBeInTheDocument();
    expect(screen.getByText(/Filter by job/)).toBeInTheDocument();
    expect(
      screen.getByText(/Cell color intensity is relative to that day/),
    ).toBeInTheDocument();
  });

  it("opens a popover with firing details", async () => {
    setup();
    await waitForLoaderToBeRemoved();
    const trigger = screen.getAllByRole("button", { name: "1" })[0];
    await userEvent.click(trigger);
    expect(
      await screen.findByText("Example scheduled task"),
    ).toBeInTheDocument();
  });
});
