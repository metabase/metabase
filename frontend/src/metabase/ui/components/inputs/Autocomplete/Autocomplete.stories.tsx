import type { ComboboxItem, ComboboxItemGroup } from "@mantine/core";

import { Autocomplete, type AutocompleteProps, Stack } from "metabase/ui";

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

const dataWithIcons: ComboboxItem[] = dataWithGroups
  .map(({ items }) => items.map(item => item))
  .flat();

const dataWithLabels = dataWithIcons.map(item => ({
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
  limit: undefined,
  disabled: false,
  readOnly: false,
  withAsterisk: false,
  dropdownPosition: "flip",
};

const sampleArgs = {
  value: dataWithLabels[0].value,
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
  limit: {
    control: { type: "number" },
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

const VariantTemplate = (args: AutocompleteProps) => (
  <Stack>
    <Autocomplete {...args} />
    <Autocomplete {...args} variant="unstyled" />
  </Stack>
);

export default {
  title: "Inputs/Autocomplete",
  component: Autocomplete,
  args,
  argTypes,
};

export const Default = {};

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
    limit: 5,
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
