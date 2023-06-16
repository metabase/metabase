import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { Engine } from "metabase-types/api";

import DatabaseForm from "./DatabaseForm";

interface SetupResult {
  onSubmit: () => void;
}

function setup(): SetupResult {
  const onSubmit = jest.fn();
  render(<DatabaseForm engines={ENGINES} isAdvanced onSubmit={onSubmit} />);

  return { onSubmit };
}

describe("DatabaseForm", () => {
  it("should submit default values", async () => {
    const { onSubmit } = setup();

    const expectedDatabaseName = "My H2 Database";
    const expectedConnectionString = "file:/somewhere";
    userEvent.type(screen.getByLabelText("Display name"), expectedDatabaseName);
    userEvent.type(
      screen.getByLabelText("Connection String"),
      expectedConnectionString,
    );

    const saveButton = screen.getByRole("button", { name: "Save" });
    await waitFor(() => {
      expect(saveButton).toBeEnabled();
    });
    userEvent.click(saveButton);

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith({
        ...EXPECTED_DEFAULT_SCHEMA,
        engine: "h2",
        name: expectedDatabaseName,
        details: {
          "advanced-options": false,
          db: expectedConnectionString,
        },
      });
    });
  });
});

const EXPECTED_DEFAULT_SCHEMA = {
  schedules: {
    metadata_sync: undefined,
    cache_field_values: undefined,
  },
  auto_run_queries: true,
  refingerprint: false,
  cache_ttl: null,
  is_sample: false,
  is_full_sync: true,
  is_on_demand: false,
};

const ENGINES: Record<string, Engine> = {
  h2: {
    source: {
      type: "official",
      contact: null,
    },
    "details-fields": [
      {
        name: "db",
        "display-name": "Connection String",
        "helper-text":
          "The local path relative to where Metabase is running from. Your string should not include the .mv.db extension.",
        placeholder: "file:/Users/camsaul/bird_sightings/toucans",
        required: true,
      },
      {
        name: "advanced-options",
        type: "section",
        default: false,
      },
      {
        name: "auto_run_queries",
        type: "boolean",
        default: true,
        "display-name": "Rerun queries for simple explorations",
        description:
          "We execute the underlying query when you explore data using Summarize or Filter. This is on by default but you can turn it off if performance is slow.",
        "visible-if": {
          "advanced-options": true,
        },
      },
      {
        name: "let-user-control-scheduling",
        type: "boolean",
        "display-name": "Choose when syncs and scans happen",
        description:
          "By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, turn this on to make changes.",
        "visible-if": {
          "advanced-options": true,
        },
      },
      {
        name: "schedules.metadata_sync",
        "display-name": "Database syncing",
        description:
          "This is a lightweight process that checks for updates to this database’s schema. In most cases, you should be fine leaving this set to sync hourly.",
        "visible-if": {
          "advanced-options": true,
          "let-user-control-scheduling": true,
        },
      },
      {
        name: "schedules.cache_field_values",
        "display-name": "Scanning for Filter Values",
        description:
          "Metabase can scan the values present in each field in this database to enable checkbox filters in dashboards and questions. This can be a somewhat resource-intensive process, particularly if you have a very large database. When should Metabase automatically scan and cache field values?",
        "visible-if": {
          "advanced-options": true,
          "let-user-control-scheduling": true,
        },
      },
      {
        name: "refingerprint",
        type: "boolean",
        "display-name": "Periodically refingerprint tables",
        description:
          "This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.",
        "visible-if": {
          "advanced-options": true,
        },
      },
    ],
    "driver-name": "H2",
    "superseded-by": null,
  },
};
