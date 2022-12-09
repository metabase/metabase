import React from "react";
import { render, screen } from "@testing-library/react";

import DataSelectorDatabaseSchemaPicker from "./DataSelectorDatabaseSchemaPicker";

describe("DataSelectorDatabaseSchemaPicker", () => {
  it("displays loading message when it has no databases", () => {
    render(<DataSelectorDatabaseSchemaPicker databases={[]} />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  describe("displays picker when it has databases", () => {
    it("includes database name if it's not about saved questions", () => {
      const databaseName = "Database name";
      const schemaName = "Schema name";

      const databases = [
        {
          id: 1,
          name: databaseName,
          schemas: [
            {
              displayName: () => schemaName,
            },
            {
              displayName: () => "another schema name",
            },
          ],
        },
      ];

      render(<DataSelectorDatabaseSchemaPicker databases={databases} />);

      expect(screen.getByText(databaseName)).toBeInTheDocument();
      expect(screen.getByText(schemaName)).toBeInTheDocument();
    });

    it("displays Saved Questions if it's about saved questions", () => {
      const databaseName = "Database name";
      const schemaName = "Schema name";

      const databases = [
        {
          id: 1,
          is_saved_questions: true,
          name: databaseName,
          schemas: [
            {
              displayName: () => schemaName,
            },
            {
              displayName: () => "another schema name",
            },
          ],
        },
      ];

      render(<DataSelectorDatabaseSchemaPicker databases={databases} />);

      expect(screen.queryByText(databaseName)).not.toBeInTheDocument();
      expect(screen.queryByText(schemaName)).not.toBeInTheDocument();
      expect(screen.getByText("Saved Questions")).toBeInTheDocument();
    });
  });
});
