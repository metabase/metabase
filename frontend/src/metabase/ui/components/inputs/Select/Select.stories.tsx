import type { ComboboxItem, ComboboxItemGroup } from "@mantine/core";
import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import { Box, Icon, Select, type SelectProps, Stack, Text } from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

type ComboboxItemWithIcon = ComboboxItem & { icon: string };

const dataWithGroupsLarge: ComboboxItemGroup<ComboboxItemWithIcon>[] = [
  {
    group: "Overall row",
    items: [
      { icon: "label", value: "10", label: "Entity key" },
      { icon: "string", value: "11", label: "Entity name" },
      {
        icon: "connections",
        value: "12",
        label: "Foreign key",
      },
    ],
  },
  {
    group: "Common",
    items: [
      { icon: "string", value: "13", label: "Category" },
      {
        icon: "string",
        value: "14",
        label: "Comment",
        disabled: true,
      },
      { icon: "string", value: "15", label: "Description" },
      { icon: "string", value: "16", label: "Title" },
    ],
  },
  {
    group: "Location",
    items: [
      { icon: "location", value: "17", label: "City" },
      { icon: "location", value: "18", label: "Country" },
      { icon: "location", value: "19", label: "Latitude" },
      { icon: "location", value: "20", label: "Longitude" },
      { icon: "location", value: "21", label: "Longitude" },
      { icon: "location", value: "22", label: "State" },
      { icon: "location", value: "23", label: "Zip code" },
    ],
  },
];

const dataWithGroups: ComboboxItemGroup<ComboboxItemWithIcon>[] =
  dataWithGroupsLarge.map(({ group, items }) => ({
    group,
    items: items.slice(0, 3),
  }));

const dataWithNoGroups: ComboboxItem[] = dataWithGroups
  .map(({ items }) => items.map((item) => item))
  .flat();

const args: Partial<SelectProps<string>> = {
  data: dataWithNoGroups,
  size: "md",
  label: "Field type",
  description: undefined,
  error: undefined,
  placeholder: "No semantic type",
  searchable: false,
  disabled: false,
  readOnly: false,
  withAsterisk: false,
  comboboxProps: {
    middlewares: {
      flip: true,
      size: true,
      shift: true,
      inline: false,
    },
  },
};

const sampleArgs = {
  value: dataWithNoGroups[0].value,
  description: "Determines how Metabase displays the field",
  error: "required",
};

const argTypes = {
  data: {
    control: { type: "json" },
  },
  size: {
    options: ["xs", "md"],
    control: { type: "inline-radio" },
  },
  label: {
    control: { type: "text" },
  },
  description: {
    control: { type: "text" },
  },
  error: {
    control: { type: "text" },
  },
  placeholder: {
    control: { type: "text" },
  },
  searchable: {
    control: { type: "boolean" },
  },
  disabled: {
    control: { type: "boolean" },
  },
  readOnly: {
    control: { type: "boolean" },
  },
  withAsterisk: {
    control: { type: "boolean" },
  },
};

const VariantTemplate = (args: SelectProps<string>) => (
  <Stack>
    <Select {...args} />
    <Select {...args} variant="unstyled" />
  </Stack>
);

export default {
  title: "Components/Inputs/Select",
  component: Select,
  args,
  argTypes,
};

export const Default = {};

type OverviewRow = {
  id: string;
  label: string;
  props: Partial<SelectProps<string>>;
  focus?: boolean;
};

const OVERVIEW_VARIANTS = [
  { title: "Basic select", searchable: false },
  { title: "Searchable select", searchable: true },
] as const;

const OVERVIEW_SIZES = ["md", "xs"] as const;

const OVERVIEW_STATES = [
  { id: "default-empty", label: "Default, empty", props: {} },
  {
    id: "default-filled",
    label: "Default, filled",
    props: { defaultValue: sampleArgs.value },
  },
  { id: "focused-empty", label: "Focused, empty", props: {}, focus: true },
  {
    id: "focused-filled",
    label: "Focused, filled",
    props: { defaultValue: sampleArgs.value },
    focus: true,
  },
  {
    id: "error-empty",
    label: "Error, empty",
    props: { error: sampleArgs.error },
  },
  {
    id: "error-filled",
    label: "Error, filled",
    props: { error: sampleArgs.error, defaultValue: sampleArgs.value },
  },
  {
    id: "error-focused-empty",
    label: "Error + Focused, empty",
    props: { error: sampleArgs.error },
    focus: true,
  },
  {
    id: "error-focused-filled",
    label: "Error + Focused, filled",
    props: { error: sampleArgs.error, defaultValue: sampleArgs.value },
    focus: true,
  },
  {
    id: "disabled-empty",
    label: "Disabled, empty",
    props: { disabled: true },
  },
  {
    id: "disabled-filled",
    label: "Disabled, filled",
    props: { disabled: true, defaultValue: sampleArgs.value },
  },
  {
    id: "clearable",
    label: "With clear button",
    props: { clearable: true, defaultValue: sampleArgs.value },
  },
  {
    id: "clearable-focused",
    label: "With clear button, focused",
    props: { clearable: true, defaultValue: sampleArgs.value },
    focus: true,
  },
  {
    id: "clearable-error",
    label: "With clear button, error",
    props: {
      clearable: true,
      defaultValue: sampleArgs.value,
      error: sampleArgs.error,
    },
  },
  {
    id: "clearable-error-focused",
    label: "With clear button, error + focused",
    props: {
      clearable: true,
      defaultValue: sampleArgs.value,
      error: sampleArgs.error,
    },
    focus: true,
  },
] satisfies OverviewRow[];

const OVERVIEW_CONTENT = [
  { id: "label-only", label: "Label only", props: {} },
  {
    id: "description",
    label: "With description",
    props: { description: "Input description" },
  },
  {
    id: "left-icon",
    label: "With left icon",
    props: {
      description: "Input description",
      leftSection: <Icon name="label" />,
    },
  },
] satisfies OverviewRow[];

const OverviewGrid = ({
  searchable,
  rows,
}: {
  searchable: boolean;
  rows: readonly OverviewRow[];
}) => (
  <Box
    style={{
      display: "grid",
      gridTemplateColumns: `14rem repeat(${OVERVIEW_SIZES.length}, max-content)`,
      columnGap: "2rem",
      rowGap: "1rem",
      alignItems: "center",
    }}
  >
    <div />
    {OVERVIEW_SIZES.map((size) => (
      <StoryJsx key={size}>
        {`<Select${searchable ? " searchable" : ""} size="${size}" />`}
      </StoryJsx>
    ))}
    {rows.map((state) => (
      <Fragment key={state.id}>
        <Text size="sm" c="text-secondary">
          {state.label}
        </Text>
        {OVERVIEW_SIZES.map((size) => (
          <Box key={size} w={256}>
            <Select
              data-state-row={state.id}
              data={dataWithNoGroups}
              label="Label"
              placeholder="Placeholder"
              searchable={searchable}
              size={size}
              {...state.props}
            />
          </Box>
        ))}
      </Fragment>
    ))}
  </Box>
);

const OverviewTemplate: StoryFn<SelectProps<string>> = () => (
  <StoryShowcase title="Select">
    {OVERVIEW_VARIANTS.map(({ title, searchable }) => (
      <StorySection key={title} title={title}>
        <OverviewGrid searchable={searchable} rows={OVERVIEW_STATES} />
      </StorySection>
    ))}
    <StorySection title="Content">
      <OverviewGrid searchable={false} rows={OVERVIEW_CONTENT} />
    </StorySection>
  </StoryShowcase>
);

const focusSelector = (id: string) => `[data-state-row="${id}"]`;

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      focus: OVERVIEW_STATES.filter((state) => state.focus).map((state) =>
        focusSelector(state.id),
      ),
    },
    controls: { include: ["theme"] },
  },
};

export const EmptyMd = {
  render: VariantTemplate,
  name: "Empty, md",
};

export const AsteriskMd = {
  render: VariantTemplate,
  name: "Asterisk, md",
  args: {
    withAsterisk: true,
  },
};

export const ClearableMd = {
  render: VariantTemplate,
  name: "Clearable, md",
  args: {
    defaultValue: sampleArgs.value,
    clearable: true,
    withAsterisk: true,
  },
};

export const DescriptionMd = {
  render: VariantTemplate,
  name: "Description, md",
  args: {
    description: sampleArgs.description,
    withAsterisk: true,
  },
};

export const DisabledMd = {
  render: VariantTemplate,
  name: "Disabled, md",
  args: {
    description: sampleArgs.description,
    disabled: true,
    withAsterisk: true,
  },
};

export const ErrorMd = {
  render: VariantTemplate,
  name: "Error, md",
  args: {
    description: sampleArgs.description,
    error: sampleArgs.error,
    withAsterisk: true,
  },
};

export const ReadOnlyMd = {
  render: VariantTemplate,
  name: "Read only, md",
  args: {
    defaultValue: sampleArgs.value,
    description: sampleArgs.description,
    readOnly: true,
    withAsterisk: true,
  },
};

export const IconsMd = {
  render: VariantTemplate,
  name: "Icons, md",
  args: {
    data: dataWithNoGroups,
    description: sampleArgs.description,
    withAsterisk: true,
  },
};

export const GroupsMd = {
  render: VariantTemplate,
  name: "Groups, md",
  args: {
    data: dataWithGroups,
    description: sampleArgs.description,
    withAsterisk: true,
  },
};

export const LargeSetsMd = {
  render: VariantTemplate,
  name: "Large sets, md",
  args: {
    data: dataWithGroupsLarge,
    description: sampleArgs.description,
    withAsterisk: true,
  },
};

export const SearchableMd = {
  render: VariantTemplate,
  name: "Searchable, md",
  args: {
    data: dataWithGroupsLarge,
    description: sampleArgs.description,
    searchable: true,
    withAsterisk: true,
  },
};

export const EmptyXs = {
  render: VariantTemplate,
  name: "Empty, xs",
  args: {
    size: "xs",
  },
};

export const AsteriskXs = {
  render: VariantTemplate,
  name: "Asterisk, xs",
  args: {
    ...AsteriskMd.args,
    size: "xs",
  },
};

export const ClearableXs = {
  render: VariantTemplate,
  name: "Clearable, xs",
  args: {
    ...ClearableMd.args,
    size: "xs",
  },
};

export const DescriptionXs = {
  render: VariantTemplate,
  name: "Description, xs",
  args: {
    ...DescriptionMd.args,
    size: "xs",
  },
};

export const DisabledXs = {
  render: VariantTemplate,
  name: "Disabled, xs",
  args: {
    ...DisabledMd.args,
    size: "xs",
  },
};

export const ErrorXs = {
  render: VariantTemplate,
  name: "Error, xs",
  args: {
    ...ErrorMd.args,
    size: "xs",
  },
};

export const ReadOnlyXs = {
  render: VariantTemplate,
  name: "Read only, xs",
  args: {
    ...ReadOnlyMd.args,
    size: "xs",
  },
};

export const IconsXs = {
  render: VariantTemplate,
  name: "Icons, xs",
  args: {
    ...IconsMd.args,
    size: "xs",
  },
};

export const GroupsXs = {
  render: VariantTemplate,
  name: "Groups, xs",
  args: {
    ...GroupsMd.args,
    size: "xs",
  },
};

export const LargeSetsXs = {
  render: VariantTemplate,
  name: "Large sets, xs",
  args: {
    ...LargeSetsMd.args,
    size: "xs",
  },
};

export const SearchableXs = {
  render: VariantTemplate,
  name: "Searchable, xs",
  args: {
    ...SearchableMd.args,
    size: "xs",
  },
};
