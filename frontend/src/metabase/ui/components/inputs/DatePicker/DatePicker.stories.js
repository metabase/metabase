import { SdkVisualizationWrapper } from "__support__/storybook";
import { Box, DatePicker } from "metabase/ui";

const args = {
  type: "default",
  allowDeselect: undefined,
  allowSingleDateInRange: undefined,
  numberOfColumns: undefined,
};

const sampleArgs = {
  date1: new Date(2023, 9, 8),
  date2: new Date(2023, 9, 24),
  date3: new Date(2023, 9, 16),
};

const argTypes = {
  type: {
    options: ["default", "multiple", "range"],
    control: { type: "inline-radio" },
  },
  allowDeselect: {
    control: { type: "boolean" },
  },
  allowSingleDateInRange: {
    control: { type: "boolean" },
  },
  numberOfColumns: {
    control: { type: "number" },
  },
};

const DefaultTemplate = args => {
  return <DatePicker {...args} />;
};

const Default = DefaultTemplate.bind({});
const AllowDeselect = DefaultTemplate.bind({});
const MultipleDates = DefaultTemplate.bind({});
const DatesRange = DefaultTemplate.bind({});
const DatesRangeSdk = DefaultTemplate.bind({});

const theme = {
  colors: {
    brand: "#DF75E9",
    filter: "#7ABBF9",
    "text-primary": "#E3E7E4",
    "text-secondary": "#E3E7E4",
    "text-tertiary": "#E3E7E4",
    border: "#3B3F3F",
    background: "#151C20",
    "background-hover": "#4C4A48",
  },
};

const SingleDateInRange = DefaultTemplate.bind({});
const NumberOfColumns = DefaultTemplate.bind({});

export default {
  title: "Inputs/DatePicker",
  component: DatePicker,
  args,
  argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
  args: {
    defaultDate: sampleArgs.date1,
  },
};

export const AllowDeselect_ = {
  render: AllowDeselect,
  name: "Allow deselect",
  args: {
    allowDeselect: true,
    defaultDate: sampleArgs.date1,
    defaultValue: sampleArgs.date1,
  },
};

export const MultipleDates_ = {
  render: MultipleDates,
  name: "Multiple dates",
  args: {
    type: "multiple",
    defaultValue: [sampleArgs.date1, sampleArgs.date2],
    defaultDate: sampleArgs.date1,
  },
};

export const DatesRange_ = {
  render: DatesRange,
  name: "Dates range",
  args: {
    type: "range",
    defaultValue: [sampleArgs.date1, sampleArgs.date2],
    defaultDate: sampleArgs.date1,
  },
};

export const DatesRangeSdk_ = {
  render: () => (
    <SdkVisualizationWrapper theme={theme}>
      <Box bg="background">
        <DatesRangeSdk {...DatesRangeSdk.args} />
      </Box>
    </SdkVisualizationWrapper>
  ),

  name: "Dates range SDK",
};

export const SingleDateInRange_ = {
  render: SingleDateInRange,
  name: "Single date in range",
  args: {
    type: "range",
    defaultValue: [sampleArgs.date1, sampleArgs.date1],
    defaultDate: sampleArgs.date1,
    allowSingleDateInRange: true,
  },
};

export const NumberOfColumns_ = {
  render: NumberOfColumns,
  name: "Number of columns",
  args: {
    type: "range",
    defaultValue: [sampleArgs.date1, sampleArgs.date3],
    defaultDate: sampleArgs.date1,
    numberOfColumns: 2,
  },
};
