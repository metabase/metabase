import userEvent from "@testing-library/user-event";
import { useState } from "react";

import { setupDatabasesEndpoints } from "__support__/server-mocks";
import { renderWithProviders, screen, waitFor } from "__support__/ui";
import type { Database } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";

import { DatabaseMultiSelect } from "./DatabaseMultiSelect";

const mockDatabases: Database[] = [
  createMockDatabase({ id: 1, name: "Database 1" }),
  createMockDatabase({ id: 2, name: "Database 2" }),
  createMockDatabase({ id: 3, name: "Database 3" }),
];

const TestDatabaseMultiSelect = ({
  initialValue = [],
  isOptionDisabled,
  disabledOptionTooltip,
}: {
  initialValue?: number[];
  isOptionDisabled?: (database: Database) => boolean;
  disabledOptionTooltip?: string;
}) => {
  const [value, setValue] = useState(initialValue);

  return (
    <DatabaseMultiSelect
      value={value}
      onChange={setValue}
      placeholder="Pick a database"
      isOptionDisabled={isOptionDisabled}
      disabledOptionTooltip={disabledOptionTooltip}
    />
  );
};

interface SetupOpts {
  initialValue?: number[];
  databases?: Database[];
  isOptionDisabled?: (database: Database) => boolean;
  disabledOptionTooltip?: string;
}

function setup({
  initialValue = [],
  databases = mockDatabases,
  isOptionDisabled,
  disabledOptionTooltip,
}: SetupOpts = {}) {
  setupDatabasesEndpoints(databases);

  renderWithProviders(
    <TestDatabaseMultiSelect
      initialValue={initialValue}
      isOptionDisabled={isOptionDisabled}
      disabledOptionTooltip={disabledOptionTooltip}
    />,
  );
}

describe("DatabaseMultiSelect", () => {
  it("should show database options in the dropdown", async () => {
    setup();

    expect(
      await screen.findByPlaceholderText("Pick a database"),
    ).toBeInTheDocument();

    await userEvent.click(
      await screen.findByPlaceholderText("Pick a database"),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /Database 1/ }),
      ).toBeInTheDocument();

      expect(
        screen.getByRole("option", { name: /Database 2/ }),
      ).toBeInTheDocument();

      expect(
        screen.getByRole("option", { name: /Database 3/ }),
      ).toBeInTheDocument();
    });
  });

  it("should allow selecting a database", async () => {
    setup();

    await userEvent.click(
      await screen.findByPlaceholderText("Pick a database"),
    );

    await waitFor(() => {
      expect(screen.getByText("Database 1")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Database 1"));

    // after selecting, the pill should appear in the input area
    await waitFor(() => {
      expect(screen.getByText("Database 1")).toBeInTheDocument();
    });
  });

  it("should show pre-selected databases as pills", async () => {
    setup({ initialValue: [1, 2] });

    // pills show database names (wait for data to load)
    expect(await screen.findByText("Database 1")).toBeInTheDocument();
    expect(screen.getByText("Database 2")).toBeInTheDocument();

    // each pill has a remove button
    expect(screen.getAllByLabelText("Remove")).toHaveLength(2);
  });

  it("should prevent selecting disabled options", async () => {
    setup({
      isOptionDisabled: (db) => db.id === 1,
      disabledOptionTooltip: "Not supported",
    });

    await userEvent.click(
      await screen.findByPlaceholderText("Pick a database"),
    );

    const option = await screen.findByRole("option", { name: /Database 1/ });
    await userEvent.click(option);

    // clicking a disabled option should not select it - no pills should appear
    expect(screen.queryByLabelText("Remove")).not.toBeInTheDocument();
  });
});
