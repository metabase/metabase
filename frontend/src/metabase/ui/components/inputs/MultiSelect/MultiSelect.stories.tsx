import type { StoryFn } from "@storybook/react";
import { Fragment } from "react";

import {
  Box,
  Icon,
  Loader,
  MultiSelect,
  type MultiSelectProps,
  Stack,
  Text,
} from "metabase/ui";
import {
  StoryJsx,
  StorySection,
  StoryShowcase,
} from "metabase/ui/stories/showcase";

import S from "./MultiSelect.module.css";

const dataWithGroupsLarge = [
  {
    group: "Overall row",
    items: [
      { value: "10", label: "Entity key", icon: "label" },
      { value: "11", label: "Entity name", icon: "string" },
      {
        value: "12",
        label: "Foreign key",
        icon: "connections",
      },
    ],
  },
  {
    group: "Common",
    items: [
      { value: "13", label: "Category", icon: "string" },
      {
        value: "14",
        label: "Comment",
        icon: "string",
        disabled: true,
      },
      { value: "15", label: "Description", icon: "string" },
      { value: "16", label: "Title", icon: "string" },
    ],
  },
  {
    group: "Location",
    items: [
      { value: "17", label: "City", icon: "location" },
      { value: "18", label: "Country", icon: "location" },
      { value: "19", label: "Latitude", icon: "location" },
      { value: "20", label: "Longitude", icon: "location" },
      { value: "21", label: "Longitude", icon: "location" },
      { value: "22", label: "State", icon: "location" },
      { value: "23", label: "Zip code", icon: "location" },
    ],
  },
];

const dataWithGroups = dataWithGroupsLarge;

const dataWithIcons = dataWithGroupsLarge.flatMap((group) => group.items);

const dataWithLabels = dataWithIcons.map((item) => ({
  ...item,
  icon: undefined,
}));

const args = {
  data: dataWithLabels,
  size: "md",
  label: "Field type",
  description: undefined,
  error: undefined,
  placeholder: "No semantic type",
  searchable: false,
  creatable: false,
  disabled: false,
  readOnly: false,
  withAsterisk: false,
  dropdownPosition: "flip",
};

const sampleArgs = {
  value: [dataWithLabels[0].value],
  description: "Determines how Metabase displays the field",
  error: "required",
};

const argTypes = {
  data: {
    control: { type: "json" },
  },
  size: {
    options: ["md", "lg"],
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
  creatable: {
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
  dropdownPosition: {
    options: ["bottom", "top", "flip"],
    control: { type: "inline-radio" },
  },
};

const VariantTemplate = (args: MultiSelectProps) => (
  <Stack>
    <MultiSelect {...args} />
    <MultiSelect {...args} variant="unstyled" />
  </Stack>
);

export default {
  title: "Components/Inputs/MultiSelect",
  component: MultiSelect,
  args,
  argTypes,
};

export const Default = {};

const OVERVIEW_SIZES = ["md", "lg"] as const;

const OVERVIEW_VALUE = [dataWithLabels[0].value, dataWithLabels[1].value];

type OverviewRow = {
  id: string;
  label: string;
  props: Partial<MultiSelectProps>;
  focus?: boolean;
};

const OVERVIEW_STATES = [
  { id: "default-empty", label: "Default, empty", props: {} },
  {
    id: "default-filled",
    label: "Default, filled",
    props: { defaultValue: OVERVIEW_VALUE },
  },
  { id: "focused-empty", label: "Focused, empty", props: {}, focus: true },
  {
    id: "focused-filled",
    label: "Focused, filled",
    props: { defaultValue: OVERVIEW_VALUE },
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
    props: { error: sampleArgs.error, defaultValue: OVERVIEW_VALUE },
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
    props: { error: sampleArgs.error, defaultValue: OVERVIEW_VALUE },
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
    props: { disabled: true, defaultValue: OVERVIEW_VALUE },
  },
  {
    id: "clearable",
    label: "With clear button",
    props: { clearable: true, defaultValue: OVERVIEW_VALUE },
  },
  {
    id: "clearable-focused",
    label: "With clear button, focused",
    props: { clearable: true, defaultValue: OVERVIEW_VALUE },
    focus: true,
  },
  // TODO: use the `loading` prop instead of a Loader in `rightSection` after upgrading Mantine
  {
    id: "loading-focused-empty",
    label: "Loading + Focused, empty",
    props: { rightSection: <Loader size="xs" /> },
    focus: true,
  },
  {
    id: "loading-focused-filled",
    label: "Loading + Focused, filled",
    props: {
      rightSection: <Loader size="xs" />,
      defaultValue: OVERVIEW_VALUE,
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

const OverviewGrid = ({ rows }: { rows: readonly OverviewRow[] }) => (
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
      <StoryJsx key={size}>{`<MultiSelect size="${size}" />`}</StoryJsx>
    ))}
    {rows.map((state) => (
      <Fragment key={state.id}>
        <Text size="sm" c="text-secondary">
          {state.label}
        </Text>
        {OVERVIEW_SIZES.map((size) => (
          <Box key={size} w={256}>
            <MultiSelect
              wrapperProps={{ "data-state-row": state.id }}
              data={dataWithLabels}
              label="Label"
              placeholder="Placeholder"
              size={size}
              {...state.props}
            />
          </Box>
        ))}
      </Fragment>
    ))}
  </Box>
);

const OverviewTemplate: StoryFn<MultiSelectProps> = () => (
  <StoryShowcase title="MultiSelect">
    <StorySection title="States">
      <OverviewGrid rows={OVERVIEW_STATES} />
    </StorySection>
    <StorySection title="Content">
      <OverviewGrid rows={OVERVIEW_CONTENT} />
    </StorySection>
  </StoryShowcase>
);

const focusSelector = (id: string) =>
  `[data-state-row="${id}"] .${S.MultiSelectInput}`;

export const Overview = {
  render: OverviewTemplate,
  parameters: {
    pseudo: {
      focusWithin: OVERVIEW_STATES.filter((state) => state.focus).map((state) =>
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
    data: dataWithIcons,
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

export const CreatableMd = {
  render: VariantTemplate,
  name: "Creatable, md",
  args: {
    data: dataWithGroupsLarge,
    description: sampleArgs.description,
    getCreateLabel: (query: string) => `New ${query}`,
    creatable: true,
    searchable: true,
    withAsterisk: true,
  },
};

export const EmptyLg = {
  render: VariantTemplate,
  name: "Empty, lg",
  args: {
    size: "lg",
  },
};

export const AsteriskLg = {
  render: VariantTemplate,
  name: "Asterisk, lg",
  args: {
    ...AsteriskMd.args,
    size: "lg",
  },
};

export const ClearableLg = {
  render: VariantTemplate,
  name: "Clearable, lg",
  args: {
    ...ClearableMd.args,
    size: "lg",
  },
};

export const DescriptionLg = {
  render: VariantTemplate,
  name: "Description, lg",
  args: {
    ...DescriptionMd.args,
    size: "lg",
  },
};

export const DisabledLg = {
  render: VariantTemplate,
  name: "Disabled, lg",
  args: {
    ...DisabledMd.args,
    size: "lg",
  },
};

export const ErrorLg = {
  render: VariantTemplate,
  name: "Error, lg",
  args: {
    ...ErrorMd.args,
    size: "lg",
  },
};

export const ReadOnlyLg = {
  render: VariantTemplate,
  name: "Read only, lg",
  args: {
    ...ReadOnlyMd.args,
    size: "lg",
  },
};

export const IconsLg = {
  render: VariantTemplate,
  name: "Icons, lg",
  args: {
    ...IconsMd.args,
    size: "lg",
  },
};

export const GroupsLg = {
  render: VariantTemplate,
  name: "Groups, lg",
  args: {
    ...GroupsMd.args,
    size: "lg",
  },
};

export const LargeSetsLg = {
  render: VariantTemplate,
  name: "Large sets, lg",
  args: {
    ...LargeSetsMd.args,
    size: "lg",
  },
};

export const SearchableLg = {
  render: VariantTemplate,
  name: "Searchable, lg",
  args: {
    ...SearchableMd.args,
    size: "lg",
  },
};

export const CreatableLg = {
  render: VariantTemplate,
  name: "Creatable, lg",
  args: {
    ...CreatableMd.args,
    size: "lg",
  },
};
