import { setupEnterpriseOnlyPlugin } from "__support__/enterprise";
import { mockSettings } from "__support__/settings";
import { renderWithProviders } from "__support__/ui";
import type {
  DatabaseData,
  Engine,
  EngineKey,
  Settings,
} from "metabase-types/api";
import { createMockState } from "metabase-types/store/mocks";

import { DatabaseForm } from "../DatabaseForm";

import { postgresFormConfig } from "./postgres-form-config.mock";

export const TEST_ENGINES: Record<string, Engine> = {
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
      {
        name: "is-destination-database",
        type: "hidden",
        default: false,
      },
    ],
    "driver-name": "H2",
    "superseded-by": null,
    "extra-info": null,
  },
  postgres: postgresFormConfig,
};

export interface SetupOpts {
  settings?: Settings;
  enterprisePlugins?: Parameters<typeof setupEnterpriseOnlyPlugin>[0][];
  engines?: Record<string, Engine>;
  initialValues?: Partial<DatabaseData> & { engine?: EngineKey };
  isAdvanced?: boolean;
}

export const setup = ({
  settings,
  enterprisePlugins,
  engines = TEST_ENGINES,
  initialValues = {},
  isAdvanced = true,
}: SetupOpts = {}) => {
  const state = createMockState({
    settings: mockSettings({ ...settings, engines }),
  });

  if (enterprisePlugins) {
    enterprisePlugins.forEach((plugin) => {
      setupEnterpriseOnlyPlugin(plugin);
    });
  }

  const onSubmit = jest.fn();

  renderWithProviders(
    <DatabaseForm
      initialValues={{
        engine: "h2",
        ...initialValues,
      }}
      config={{ isAdvanced }}
      onSubmit={onSubmit}
      location="admin"
    />,
    {
      storeInitialState: state,
    },
  );

  return { onSubmit };
};
