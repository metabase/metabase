import { renderWithProviders, screen } from "__support__/ui";
import { createMockDatabase } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { DatabaseReplicationSection } from "./DatabaseReplicationSection";

const setup = ({ engine = "postgres", settings = {} } = {}) => {
  const database = createMockDatabase({ id: 1, engine });

  const storeInitialState = createMockState({
    settings: createMockSettingsState({
      "database-replication-enabled": true,
      ...settings,
    }),
  });

  return renderWithProviders(
    <DatabaseReplicationSection database={database} />,
    { storeInitialState },
  );
};

describe("DatabaseReplicationSection", () => {
  it("should show for both database-replication-enabled AND postgres engine", () => {
    setup({
      engine: "postgres",
      settings: { "database-replication-enabled": true },
    });

    const element = screen.queryByText("Data replication");
    expect(element).toBeInTheDocument();
  });

  it("should now show for other combinations", () => {
    const noShow = [
      { enabled: true, engine: "mysql" },
      { enabled: false, engine: "postgres" },
      { enabled: false, engine: "mysql" },
      { enabled: null, engine: "postgres" },
    ];

    noShow.forEach(({ enabled, engine }) => {
      const { unmount } = setup({
        engine,
        settings: { "database-replication-enabled": enabled },
      });

      const element = screen.queryByText("Data replication");
      expect(element).not.toBeInTheDocument();

      unmount();
    });
  });
});
