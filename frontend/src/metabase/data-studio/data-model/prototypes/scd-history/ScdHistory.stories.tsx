import type { Meta, StoryObj } from "@storybook/react";

import { VisualizationWrapper } from "__support__/storybook";

import { HistoryLens } from "./HistoryLens";
import {
  HistoryChecksDrawer,
  HistorySetupDrawer,
  MetabotComparison,
} from "./HistorySetup";
import { PrototypeFrame } from "./PrototypeFrame";
import { ImplicitJoinPicker, VersionAwareJoin } from "./VersionAwareJoin";

const meta: Meta = {
  title: "Prototypes/SCD history",
  parameters: { layout: "fullscreen", loki: { skip: true } },
  decorators: [
    (Story) => (
      <VisualizationWrapper>
        <Story />
      </VisualizationWrapper>
    ),
  ],
};

export default meta;

type Story = StoryObj;

export const A0Today: Story = {
  name: "A0 · Today: versions counted as customers",
  render: () => (
    <PrototypeFrame
      step="A0"
      isBroken
      title="Today, a history table reads as a list of customers"
      description="Browse dim_customer and filter Plan is Pro. Count is COUNT(*), so 6 old and current Pro versions read as 6 customers. Only 2 customers are on Pro today."
    >
      <HistoryLens isHistoryAware={false} initialPlan="Pro" />
    </PrototypeFrame>
  ),
};

export const A1CurrentByDefault: Story = {
  name: "A1 · Current versions by default",
  render: () => (
    <PrototypeFrame
      step="A1"
      title="With a History binding, the table opens on current versions"
      description="Metabase adds a Current version filter that the user can remove, and Count becomes Count of customers (distinct durable key). The data is unchanged; only the defaults are."
    >
      <HistoryLens isHistoryAware initialPlan="Pro" />
    </PrototypeFrame>
  ),
};

export const A2AsOfDate: Story = {
  name: "A2 · As of a date",
  render: () => (
    <PrototypeFrame
      step="A2"
      title="The same filter answers “as of” any date"
      description="Open the filter pill and drag the date. Rows are kept when Valid From ≤ date < Valid To, and an empty Valid To counts as still open."
    >
      <HistoryLens
        isHistoryAware
        initialFilter={{ type: "as-of", date: "2025-12-31" }}
        isFilterPopoverOpen
      />
    </PrototypeFrame>
  ),
};

export const A3CustomerTimeline: Story = {
  name: "A3 · One customer’s history",
  render: () => (
    <PrototypeFrame
      step="A3"
      title="Clicking a row opens the customer, not one version"
      description="Each changing attribute gets a lane, orders sit on the version they were placed under, and the as-of date is the purple line."
      height={720}
    >
      <HistoryLens
        isHistoryAware
        initialFilter={{ type: "as-of", date: "2025-12-31" }}
        initialCustomerId="C-101"
      />
    </PrototypeFrame>
  ),
};

export const B0Today: Story = {
  name: "B0 · Today: the join fans out",
  render: () => (
    <PrototypeFrame
      step="B0"
      isBroken
      title="Today, joining a fact to a history table multiplies revenue"
      description="Fct Orders joined to Dim Customer on Customer ID is a plain equality join, and implicit FK joins build the same one. Every order matches every version of its customer."
      height={560}
    >
      <VersionAwareJoin isHistoryAware={false} />
    </PrototypeFrame>
  ),
};

export const B1MatchVersion: Story = {
  name: "B1 · Join asks which version",
  render: () => (
    <PrototypeFrame
      step="B1"
      title="The join step asks which version of the customer to match"
      description="“At order date” uses Fct Orders’ main date and Dim Customer’s validity range. “Current” uses the current-row rule. “Every version” is the old behaviour, labelled for what it does."
      height={640}
    >
      <VersionAwareJoin isHistoryAware />
    </PrototypeFrame>
  ),
};

export const B2ColumnPicker: Story = {
  name: "B2 · Implicit joins: as it was vs now",
  render: () => (
    <PrototypeFrame
      step="B2"
      title="Every column picker offers the customer as it was and as it is now"
      description="Someone who never opens the notebook picks Summarize by → Customer. Both groups add up to the same total and split it differently."
      height={760}
    >
      <ImplicitJoinPicker />
    </PrototypeFrame>
  ),
};

export const C1Setup: Story = {
  name: "C1 · Detect a dbt snapshot",
  render: () => (
    <PrototypeFrame
      step="C1"
      title="Data Studio recognises a dbt snapshot and fills the History binding"
      description="New fields: a version key, and a current-row rule (flag, empty Valid To, or the 9999-12-31 value Fivetran uses), because dbt snapshots have no current flag. Columns over time shows which attributes change."
      height={1130}
    >
      <HistorySetupDrawer />
    </PrototypeFrame>
  ),
};

export const C2ChecksAndContext: Story = {
  name: "C2 · History checks and agent context",
  render: () => (
    <PrototypeFrame
      step="C2"
      title="The binding powers health checks and tells Metabot how to read the table"
      description="Checks run after sync, and failures are linked to the rows. The same binding becomes a structure block in what Metabot gets for the table."
      height={900}
    >
      <HistoryChecksDrawer />
    </PrototypeFrame>
  ),
};

export const C3Metabot: Story = {
  name: "C3 · Metabot before and after",
  render: () => (
    <PrototypeFrame
      step="C3"
      title="The same questions, with and without the structure block"
      description="Today’s answers count versions. With the structure block, Metabot counts distinct customers and uses the validity range for past dates."
      height={600}
    >
      <MetabotComparison />
    </PrototypeFrame>
  ),
};
