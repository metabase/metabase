import React from "react";
import type { ComponentStory } from "@storybook/react";
import {
  createMockDatabaseData,
  createMockEngine,
  createMockEngineField,
} from "metabase-types/api/mocks";
import DatabaseForm from "./DatabaseForm";

export default {
  title: "Databases/DatabaseForm",
  component: DatabaseForm,
};

const Template: ComponentStory<typeof DatabaseForm> = args => {
  return <DatabaseForm {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  initialValues: createMockDatabaseData(),
  engines: {
    h2: createMockEngine({
      "driver-name": "H2",
      "details-fields": [
        createMockEngineField({
          name: "db",
          "display-name": "Connection String",
          "helper-text":
            "The local path relative to where Metabase is running from. Your string should not include the .mv.db extension.",
          placeholder: "file:/Users/camsaul/bird_sightings/toucans",
          required: true,
        }),
        createMockEngineField({
          name: "auto_run_queries",
          type: "boolean",
          "display-name": "Rerun queries for simple explorations",
          description:
            "We execute the underlying query when you explore data using Summarize or Filter. This is on by default but you can turn it off if performance is slow.",
        }),
        createMockEngineField({
          name: "let-user-control-scheduling",
          type: "boolean",
          "display-name": "Choose when syncs and scans happen",
          description:
            "By default, Metabase does a lightweight hourly sync and an intensive daily scan of field values. If you have a large database, turn this on to make changes.",
        }),
        createMockEngineField({
          name: "refingerprint",
          type: "boolean",
          "display-name": "Periodically refingerprint tables",
          description:
            "This enables Metabase to scan for additional field values during syncs allowing smarter behavior, like improved auto-binning on your bar charts.",
        }),
      ],
    }),
  },
};
