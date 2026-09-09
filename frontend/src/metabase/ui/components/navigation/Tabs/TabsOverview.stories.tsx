import { action } from "@storybook/addon-actions";
import { Fragment, type ReactNode } from "react";

import {
  Badge,
  Box,
  Group,
  Icon,
  Kbd,
  Tabs,
  type TabsProps,
  Text,
} from "metabase/ui";
import { StorySection, StoryShowcase } from "metabase/ui/stories/showcase";
import type { IconName } from "metabase-types/api";

const LABEL = "Value";
const TAB_ICON: IconName = "model";

// The `variant × size` combinations the design system supports; `sm` exists
// only for pills.
const COLUMNS = [
  { tabsProps: { variant: "default", size: "md" }, width: "22rem" },
  { tabsProps: { variant: "pills", size: "md" }, width: "22rem" },
  { tabsProps: { variant: "pills", size: "sm" }, width: "22rem" },
] as const satisfies readonly {
  tabsProps: Pick<TabsProps, "variant" | "size">;
  width: string;
}[];

type TabsColumn = (typeof COLUMNS)[number];

type TabState = {
  id: string;
  label: string;
  selected?: boolean;
  disabled?: boolean;
};

const STATES: TabState[] = [
  { id: "default", label: "Default" },
  { id: "hover", label: "Hover" },
  { id: "pressed", label: "Pressed" },
  { id: "selected", label: "Selected", selected: true },
  { id: "hover-selected", label: "Selected + hover", selected: true },
  { id: "disabled", label: "Disabled", disabled: true },
];

const PSEUDO_STATE_PARAMETERS = {
  pseudo: {
    hover: ["[data-state-row='hover']", "[data-state-row='hover-selected']"],
    active: ["[data-state-row='pressed']"],
  },
};

type ContentKind = "text" | "icon-text" | "icon";

const CONTENT_KINDS: { kind: ContentKind; label: string }[] = [
  { kind: "text", label: "Text" },
  { kind: "icon-text", label: "Icon + text" },
  { kind: "icon", label: "Icon only" },
];

const RIGHT_SECTIONS: { id: string; label: string; rightSection: ReactNode }[] =
  [
    { id: "icon", label: "Icon", rightSection: <Icon name={TAB_ICON} /> },
    {
      id: "kbd",
      label: "Kbd",
      rightSection: (
        <Group gap="xxxs" wrap="nowrap">
          <Kbd>⌘</Kbd>
          <Kbd>C</Kbd>
        </Group>
      ),
    },
    { id: "badge", label: "Badge", rightSection: <Badge>1</Badge> },
  ];

type ExampleTab = {
  value: string;
  content: ContentKind;
  rightSection?: ReactNode;
  disabled?: boolean;
  stateRow?: string;
};

type ExampleTabsProps = Pick<TabsProps, "orientation"> & {
  column: TabsColumn;
  tabs: ExampleTab[];
  selected: string | null;
  listBorder?: boolean;
};

function ExampleTabs({
  column,
  orientation,
  tabs,
  selected,
  listBorder = true,
}: ExampleTabsProps) {
  return (
    <Tabs
      {...column.tabsProps}
      orientation={orientation}
      value={selected}
      onChange={action("onChange")}
      listBorder={listBorder}
    >
      <Tabs.List>
        {tabs.map((tab) => {
          const leftSection =
            tab.content !== "text" ? <Icon name={TAB_ICON} /> : undefined;

          return (
            <Tabs.Tab
              key={tab.value}
              value={tab.value}
              disabled={tab.disabled}
              data-state-row={tab.stateRow}
              leftSection={leftSection}
              rightSection={tab.rightSection}
            >
              {tab.content !== "icon" ? LABEL : undefined}
            </Tabs.Tab>
          );
        })}
      </Tabs.List>
    </Tabs>
  );
}

function SingleTab({
  column,
  state,
  content = "text",
}: {
  column: TabsColumn;
  state: TabState;
  content?: ContentKind;
}) {
  return (
    <ExampleTabs
      column={column}
      listBorder={false}
      selected={state.selected ? "tab" : null}
      tabs={[
        { value: "tab", content, disabled: state.disabled, stateRow: state.id },
      ]}
    />
  );
}

function VariantGrid({ children }: { children: ReactNode }) {
  return (
    <Box
      style={{
        display: "grid",
        gridTemplateColumns: `9rem ${COLUMNS.map(({ width }) => width).join(" ")}`,
        columnGap: "2rem",
        rowGap: "0.5rem",
        alignItems: "center",
      }}
    >
      {children}
    </Box>
  );
}

function VariantRow({
  label,
  render,
}: {
  label?: ReactNode;
  render: (column: TabsColumn) => ReactNode;
}) {
  return (
    <>
      <Text size="sm" c="text-secondary">
        {label}
      </Text>
      {COLUMNS.map((column) => (
        <Fragment key={`${column.tabsProps.variant}-${column.tabsProps.size}`}>
          {render(column)}
        </Fragment>
      ))}
    </>
  );
}

function getListOfTabs(tab: Omit<ExampleTab, "value">): ExampleTab[] {
  return [
    { ...tab, value: "one" },
    { ...tab, value: "two" },
    { ...tab, value: "three", disabled: true },
  ];
}

function OverviewTemplate() {
  return (
    <StoryShowcase title="Tabs">
      <StorySection title="States">
        <VariantGrid>
          {STATES.map((state) => (
            <VariantRow
              key={state.id}
              label={state.label}
              render={(column) => <SingleTab column={column} state={state} />}
            />
          ))}
        </VariantGrid>
      </StorySection>

      <StorySection title="Content">
        <VariantGrid>
          {CONTENT_KINDS.map(({ kind, label }) => (
            <VariantRow
              key={kind}
              label={label}
              render={(column) => (
                <ExampleTabs
                  column={column}
                  selected="two"
                  tabs={getListOfTabs({ content: kind })}
                />
              )}
            />
          ))}
        </VariantGrid>
      </StorySection>

      <StorySection title="Right section">
        <VariantGrid>
          {RIGHT_SECTIONS.map(({ id, label, rightSection }) => (
            <VariantRow
              key={id}
              label={label}
              render={(column) => (
                <ExampleTabs
                  column={column}
                  selected="two"
                  tabs={getListOfTabs({ content: "text", rightSection })}
                />
              )}
            />
          ))}
        </VariantGrid>
      </StorySection>

      <StorySection title="Vertical orientation">
        <VariantGrid>
          <VariantRow
            render={(column) => (
              <ExampleTabs
                column={column}
                orientation="vertical"
                selected="two"
                tabs={getListOfTabs({ content: "icon-text" })}
              />
            )}
          />
        </VariantGrid>
      </StorySection>
    </StoryShowcase>
  );
}

export default {
  title: "Components/Navigation/Tabs/Overview",
  component: Tabs,
};

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    ...PSEUDO_STATE_PARAMETERS,
    controls: { include: ["theme"] },
  },
};
