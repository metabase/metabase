import { t } from "ttag";

import type { IconName } from "metabase-types/api";

export type RoleId = "administrators" | "data-analysts" | "all-users";

export const ROLE_IDS: RoleId[] = [
  "administrators",
  "data-analysts",
  "all-users",
];

type RoleCapability = {
  icon: IconName;
  label: string;
  description: string;
};

export type Role = {
  name: string;
  description: string;
  capabilitiesTitle: string;
  capabilities: RoleCapability[];
  footnote: string;
};

export const isRoleId = (value: string | undefined): value is RoleId =>
  ROLE_IDS.some((roleId) => roleId === value);

// PROTOTYPE: mocked — the capability lists are hand-written, not derived from
// the permissions graph or the backend's role checks.
export function getRole(roleId: RoleId): Role {
  switch (roleId) {
    case "administrators":
      return {
        name: t`Administrators`,
        description: t`People who run this Metabase. They can see all data and change any setting.`,
        capabilitiesTitle: t`Only Administrators can`,
        capabilities: [
          {
            icon: "gear",
            label: t`Change admin settings`,
            description: t`Authentication, email, Slack, embedding, appearance, and the rest of Admin.`,
          },
          {
            icon: "person",
            label: t`Manage people and groups`,
            description: t`Invite and deactivate people, and decide which groups they're in.`,
          },
          {
            icon: "lock",
            label: t`Edit permissions`,
            description: t`Decide what every group can see and do, including everything in this section.`,
          },
          {
            icon: "database",
            label: t`Add and remove databases`,
            description: t`Connect new data sources, and change how existing ones sync.`,
          },
          {
            icon: "eye",
            label: t`See everything`,
            description: t`All data and every collection, including other people's personal collections.`,
          },
          {
            icon: "ai",
            label: t`Set up AI`,
            description: t`Connect an AI provider, set usage limits, and manage MCP.`,
          },
          {
            icon: "bolt",
            label: t`Create data actions`,
            description: t`Build actions that write back to your databases.`,
          },
          {
            icon: "audit",
            label: t`Review usage analytics`,
            description: t`See who viewed, created, and changed what across the instance.`,
          },
        ],
        footnote: t`Administrators can also do everything Data Analysts and All Users can.`,
      };
    case "data-analysts":
      return {
        name: t`Data Analysts`,
        description: t`People who model and curate data for everyone else.`,
        capabilitiesTitle: t`Data Analysts can, on top of what All Users can`,
        capabilities: [
          {
            icon: "data_studio",
            label: t`Use Data Studio`,
            description: t`Work in the space for modeling, cleaning, and publishing data.`,
          },
          {
            icon: "table",
            label: t`Manage table metadata`,
            description: t`Rename tables and columns, set column types, and hide tables on every database.`,
          },
          {
            icon: "sync",
            label: t`Sync and scan databases`,
            description: t`Start a schema sync or a field values scan from Data Studio. They can't edit anything about a database's connection.`,
          },
          {
            icon: "repository",
            label: t`Curate the Library`,
            description: t`Publish and organize the tables, metrics, and segments people should trust.`,
          },
          {
            icon: "metric",
            label: t`Define metrics and segments`,
            description: t`Create the official calculations and filters others reuse.`,
          },
          {
            icon: "dependencies",
            label: t`See dependencies`,
            description: t`Check what will break before changing a table, metric, or question.`,
          },
          {
            icon: "warning",
            label: t`Find broken content`,
            description: t`Use content diagnostics to spot questions and dashboards that error.`,
          },
        ],
        footnote: t`Data Analysts can't change admin settings, permissions, or database connection details. Only Administrators can.`,
      };
    case "all-users":
      return {
        name: t`All Users`,
        description: t`Everyone with an account. Every other role starts from here.`,
        capabilitiesTitle: t`Everyone can`,
        capabilities: [
          {
            icon: "insight",
            label: t`Explore data`,
            description: t`Ask questions with the query builder on any data their groups can see.`,
          },
          {
            icon: "dashboard",
            label: t`Build dashboards`,
            description: t`Create questions and dashboards in collections they can edit.`,
          },
          {
            icon: "folder",
            label: t`Keep a personal collection`,
            description: t`Save their own work somewhere only they and Administrators can see.`,
          },
          {
            icon: "subscription",
            label: t`Subscribe and get alerts`,
            description: t`Get dashboards by email or Slack, and alerts when results change.`,
          },
          {
            icon: "bookmark",
            label: t`Bookmark and search`,
            description: t`Find and pin the things they use most.`,
          },
        ],
        footnote: t`What data and collections people can reach is set in Data and Collections permissions.`,
      };
  }
}
