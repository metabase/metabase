import React from "react";
import "@testing-library/jest-dom/extend-expect";
import { render } from "@testing-library/react";

import MetabaseSettings from "metabase/lib/settings";

import AddDatabaseHelpCard from "metabase/components/AddDatabaseHelpCard";

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

jest.mock("metabase/lib/settings");

describe("AddDatabaseHelpCard", () => {
  Object.entries(ENGINES).forEach(([engine, info]) => {
    jest
      .spyOn(MetabaseSettings, "get")
      .mockImplementation(setting => (setting === "engines" ? ENGINES : {}));

    it(`correctly displays hints for ${engine} setup`, () => {
      const driverName = info["driver-name"];
      const { getByText } = render(<AddDatabaseHelpCard engine={engine} />);
      expect(getByText(`Need help setting up ${driverName}?`)).toBeVisible();
    });
  });
});
