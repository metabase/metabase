import userEvent from "@testing-library/user-event";

import { renderWithProviders, screen } from "__support__/ui";
import {
  ELEVATED_ENGINES,
  MAX_INITIAL_ENGINES_SHOWN,
} from "metabase/databases/constants";
import type { Engine } from "metabase-types/api";
import { createMockEngine } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { DatabaseEngineList } from "./DatabaseEngineList";

const mockEngines: Record<string, Engine> = {
  athena: createMockEngine({
    "driver-name": "Amazon Athena",
  }),
  ["bigquery-cloud-sdk"]: createMockEngine({
    "driver-name": "BigQuery",
  }),
  h2: createMockEngine({
    "driver-name": "H2",
    "superseded-by": "deprecated",
  }),
  mongo: createMockEngine({
    "driver-name": "MongoDB",
  }),
  mysql: createMockEngine({
    "driver-name": "MySQL",
  }),
  postgres: createMockEngine({
    "driver-name": "PostgreSQL",
  }),
  redshift: createMockEngine({
    "driver-name": "Amazon Redshift",
  }),
  snowflake: createMockEngine({
    "driver-name": "Snowflake",
  }),
  sqlserver: createMockEngine({
    "driver-name": "SQL Server",
  }),
};

const setup = () => {
  const state = createMockState({
    settings: createMockSettingsState({
      engines: mockEngines,
    }),
  });

  const onSelect = jest.fn();

  renderWithProviders(<DatabaseEngineList onSelect={onSelect} />, {
    storeInitialState: state,
  });

  return { onSelect };
};

describe("DatabaseEngineList", () => {
  it("should render initial list of elevated engines", () => {
    setup();

    expect(screen.getAllByRole("option")).toHaveLength(
      MAX_INITIAL_ENGINES_SHOWN,
    );
    ELEVATED_ENGINES.forEach((engine) => {
      expect(
        screen.getByText(mockEngines[engine]["driver-name"]),
      ).toBeInTheDocument();
    });
  });

  it("should expand and collapse the list by clicking on the toggle button", async () => {
    setup();

    await userEvent.click(screen.getByText("Show more"));
    expect(screen.getAllByRole("option").length).toBeGreaterThan(
      MAX_INITIAL_ENGINES_SHOWN,
    );
    expect(screen.getByText("Hide")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Hide"));
    expect(screen.getAllByRole("option")).toHaveLength(
      MAX_INITIAL_ENGINES_SHOWN,
    );
    expect(screen.getByText("Show more")).toBeInTheDocument();
  });

  it("should call `onSelect` when a database is selected", async () => {
    const { onSelect } = setup();

    await userEvent.click(screen.getByRole("option", { name: "PostgreSQL" }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("postgres");
  });

  it("should allow searching for databases", async () => {
    setup();

    const searchInput = screen.getByPlaceholderText("Search databases");
    await userEvent.type(searchInput, "mon");

    expect(screen.getAllByRole("option")).toHaveLength(1);
    expect(screen.getByText("MongoDB")).toBeInTheDocument();
    expect(screen.queryByText("MySQL")).not.toBeInTheDocument();
  });

  it("should allow keyboard navigation", async () => {
    const { onSelect } = setup();

    const searchInput = screen.getByPlaceholderText("Search databases");
    await userEvent.click(searchInput);

    const [mysql, postgres, sqlServer] = screen.getAllByRole("option");

    await userEvent.keyboard("{ArrowDown}");
    expect(mysql).toHaveAttribute("aria-selected", "true");
    expect(mysql).toHaveAttribute("data-combobox-selected", "true");

    await userEvent.keyboard("{ArrowDown}");
    expect(mysql).not.toHaveAttribute("aria-selected");
    expect(mysql).not.toHaveAttribute("data-combobox-selected");
    expect(postgres).toHaveAttribute("aria-selected", "true");
    expect(postgres).toHaveAttribute("data-combobox-selected", "true");

    await userEvent.keyboard("{ArrowDown}");
    expect(postgres).not.toHaveAttribute("aria-selected");
    expect(postgres).not.toHaveAttribute("data-combobox-selected");
    expect(sqlServer).toHaveAttribute("aria-selected", "true");
    expect(sqlServer).toHaveAttribute("data-combobox-selected", "true");

    // Pressing enter should submit the selected option
    await userEvent.keyboard("{Enter}");

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("sqlserver");
  });

  it("should show no results message when search has no matches", async () => {
    setup();

    const searchInput = screen.getByPlaceholderText("Search databases");
    await userEvent.type(searchInput, "nonexistent");

    expect(screen.queryAllByRole("option")).toHaveLength(0);
    expect(
      screen.getByText(/Sorry, we couldn't find this data source/),
    ).toBeInTheDocument();
  });

  it("starting to search should automatically expand the list", async () => {
    setup();

    const searchInput = screen.getByPlaceholderText("Search databases");
    expect(screen.getByText("Show more")).toBeInTheDocument();

    await userEvent.type(searchInput, "d");
    expect(screen.queryByText("Show more")).not.toBeInTheDocument();
    expect(screen.getByText("Hide")).toBeInTheDocument();
  });

  it("collapsing the list while searching should clear the search value", async () => {
    setup();

    const searchInput = screen.getByPlaceholderText("Search databases");

    await userEvent.type(searchInput, "d");
    expect(screen.getAllByRole("option")).toHaveLength(2);

    await userEvent.click(screen.getByText("Hide"));
    expect(screen.getAllByRole("option")).toHaveLength(
      MAX_INITIAL_ENGINES_SHOWN,
    );
    expect(searchInput).not.toHaveValue();
  });
});
