import { renderWithProviders, screen } from "__support__/ui";

import type { MissingSetting } from "../analyses/types";

import { AnalysisResult } from "./AnalysisResult";

const TABLE_SETTINGS_URL =
  "/data-studio/data/database/1/schema/1:PUBLIC/table/2/events";

type SetupOpts = {
  missing?: MissingSetting[];
  isTableSetUp?: boolean;
  tableSettingsUrl?: string;
  isDatabaseSupported?: boolean;
};

const setup = ({
  missing = [],
  isTableSetUp = true,
  tableSettingsUrl,
  isDatabaseSupported = true,
}: SetupOpts = {}) => {
  renderWithProviders(
    <AnalysisResult
      title="What steps did people take?"
      display="sankey"
      rawSeries={null}
      isLoading={false}
      error={undefined}
      missing={missing}
      isTableSetUp={isTableSetUp}
      tableSettingsUrl={tableSettingsUrl}
      isDatabaseSupported={isDatabaseSupported}
      setupLabel="Setup"
      onOpenSetup={jest.fn<void, []>()}
      clickActionsMode={{ actionsForClick: () => [] }}
      isDisplayOpen={false}
      onToggleDisplay={jest.fn<void, []>()}
      timelineProps={{
        timelineEventsVisibility: {},
        selectedTimelineEventIds: [],
      }}
    />,
    { withRouter: true },
  );
};

const PATHS_STEP_NAMES: MissingSetting = {
  key: "columns.event_name",
  message: "Paths needs an event name or a URL path.",
  isTableSetting: true,
};

describe("AnalysisResult", () => {
  it("links someone who can edit the table to its setup in Data Studio", () => {
    setup({ isTableSetUp: false, tableSettingsUrl: TABLE_SETTINGS_URL });

    expect(
      screen.getByText("This table isn't set up for product analysis yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Set up in Data Studio" }),
    ).toHaveAttribute("href", TABLE_SETTINGS_URL);
  });

  it("tells anyone else to ask an admin to set up the table", () => {
    setup({ isTableSetUp: false });

    expect(
      screen.getByText("Ask an admin to set up this table in Data Studio."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Setup" }),
    ).not.toBeInTheDocument();
  });

  it("sends a missing table setting to Data Studio, not the setup panel", () => {
    setup({
      missing: [PATHS_STEP_NAMES],
      tableSettingsUrl: TABLE_SETTINGS_URL,
    });

    expect(
      screen.getByText("This table needs additional setup for this analysis"),
    ).toBeInTheDocument();
    expect(screen.getByText(PATHS_STEP_NAMES.message)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Edit in Data Studio" }),
    ).toHaveAttribute("href", TABLE_SETTINGS_URL);
    expect(
      screen.queryByRole("button", { name: "Setup" }),
    ).not.toBeInTheDocument();
  });

  it("opens the setup panel for a missing analysis setting", () => {
    setup({
      missing: [{ key: "paths.start", message: "Pick a starting event." }],
    });

    expect(screen.getByRole("button", { name: "Setup" })).toBeInTheDocument();
  });

  it("explains that only ClickHouse is supported once the table is set up", () => {
    setup({ isDatabaseSupported: false });

    expect(
      screen.getByText("This prototype only runs on ClickHouse"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Results will appear here."),
    ).not.toBeInTheDocument();
  });

  it("asks for the table's setup before saying its database is unsupported", () => {
    setup({ isTableSetUp: false, isDatabaseSupported: false });

    expect(
      screen.getByText("This table isn't set up for product analysis yet"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("This prototype only runs on ClickHouse"),
    ).not.toBeInTheDocument();
  });

  it("tells anyone else to ask an admin about a missing table setting", () => {
    setup({ missing: [PATHS_STEP_NAMES] });

    expect(
      screen.getByText(
        "Ask an admin to update this table's event settings in Data Studio.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
