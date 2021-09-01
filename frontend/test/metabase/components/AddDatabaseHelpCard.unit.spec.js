import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render } from "@testing-library/react";

import MetabaseSettings from "metabase/lib/settings";

import AddDatabaseHelpCard, {
  CLOUD_HELP_URL,
  ENGINE_DOCS,
  GENERAL_DB_DOC,
} from "metabase/components/AddDatabaseHelpCard";

const ENGINES = {
  redshift: {
    "driver-name": "Amazon Redshift",
  },
  bigquery: {
    "driver-name": "BigQuery",
  },
  druid: {
    "driver-name": "Druid",
  },
  googleanalytics: {
    "driver-name": "Google Analytics",
  },
  h2: {
    "driver-name": "H2",
  },
  mongo: {
    "driver-name": "MongoDB",
  },
  mysql: {
    "driver-name": "MySQL",
  },
  postgres: {
    "driver-name": "PostgreSQL",
  },
  presto: {
    "driver-name": "Presto",
  },
  snowflake: {
    "driver-name": "Snowflake",
  },
  sparksql: {
    "driver-name": "Spark SQL",
  },
  sqlserver: {
    "driver-name": "SQL Server",
  },
  sqlite: {
    "driver-name": "SQLite",
  },
};

function setup({ engine = "mongo", isHosted = false } = {}) {
  jest
    .spyOn(MetabaseSettings, "get")
    .mockImplementation(setting => (setting === "engines" ? ENGINES : {}));
  jest.spyOn(MetabaseSettings, "isHosted").mockReturnValue(isHosted);
  return render(<AddDatabaseHelpCard engine={engine} />);
}

describe("AddDatabaseHelpCard", () => {
  Object.entries(ENGINES).forEach(([engine, info]) => {
    const expectedDisplayName = ENGINE_DOCS[engine]
      ? info["driver-name"]
      : "your database";
    const expectedDocsLink = ENGINE_DOCS[engine] || GENERAL_DB_DOC;

    it(`correctly displays hints for ${engine} setup`, () => {
      const { queryByText } = setup({ engine });
      const docsLink = queryByText("Our docs can help.");
      expect(
        queryByText(`Need help setting up ${expectedDisplayName}?`),
      ).toBeInTheDocument();
      expect(docsLink).toBeInTheDocument();
      expect(docsLink.getAttribute("href")).toBe(expectedDocsLink);
    });
  });

  it("should display a help link if it's a cloud instance", () => {
    const { queryByText } = setup({ isHosted: true });
    const helpLink = queryByText(/write us/i);
    expect(helpLink).toBeInTheDocument();
    expect(helpLink.getAttribute("href")).toBe(CLOUD_HELP_URL);
  });

  it("should not display a help link if it's a self-hosted instance", () => {
    const { queryByText } = setup({ isHosted: false });
    const helpLink = queryByText(/write us/i);
    expect(helpLink).not.toBeInTheDocument();
  });
});
