import { renderWithProviders, screen } from "__support__/ui";
import type { DatabaseFeature } from "metabase-types/api";
import { createMockDatabase } from "metabase-types/api/mocks";
import {
  createMockSettingsState,
  createMockState,
} from "metabase-types/store/mocks";

import { DatabaseReplicationSection } from "./DatabaseReplicationSection";

const setup = ({
  settings = {},
  features = [],
}: { settings?: any; features?: DatabaseFeature[] } = {}) => {
  const database = createMockDatabase({ id: 1, engine: "postgres", features });

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
      features: ["database-replication"],
      settings: { "database-replication-enabled": true },
    });

    const element = screen.queryByText("Database replication");
    expect(element).toBeInTheDocument();
  });

  it("should not show for other combinations", () => {
    const noShow = [
      { enabled: true, feature: false },
      { enabled: false, feature: true },
      { enabled: false, feature: false },
    ];

    noShow.forEach(({ enabled, feature }) => {
      const { unmount } = setup({
        features: feature ? ["database-replication"] : [],
        settings: { "database-replication-enabled": enabled },
      });

      const element = screen.queryByText("Database replication");
      expect(element).not.toBeInTheDocument();

      unmount();
    });
  });
});
