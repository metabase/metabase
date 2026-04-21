import { SdkVisualizationWrapper } from "__support__/storybook";
import { Box, DatePicker, type DatePickerProps } from "metabase/ui";

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

export default {
  title: "Components/Inputs/DatePicker",
  component: DatePicker,
  args,
  argTypes,
};

export const Default = {
  args: {
    defaultDate: sampleArgs.date1,
  },
};

export const AllowDeselect = {
  name: "Allow deselect",
  args: {
    allowDeselect: true,
    defaultDate: sampleArgs.date1,
    defaultValue: sampleArgs.date1,
  },
};

export const MultipleDates = {
  name: "Multiple dates",
  args: {
    type: "multiple",
    defaultValue: [sampleArgs.date1, sampleArgs.date2],
    defaultDate: sampleArgs.date1,
  },
};

export const DatesRange = {
  name: "Dates range",
  args: {
    type: "range" as DatePickerProps["type"],
    defaultValue: [sampleArgs.date1, sampleArgs.date2],
    defaultDate: sampleArgs.date1,
  },
};

export const DatesRangeSdk = {
  render: () => (
    <SdkVisualizationWrapper theme={theme}>
      <Box bg="background-primary">
        <DatePicker {...DatesRange.args} />
      </Box>
    </SdkVisualizationWrapper>
  ),

  name: "Dates range SDK",
};

export const SingleDateInRange = {
  name: "Single date in range",
  args: {
    type: "range",
    defaultValue: [sampleArgs.date1, sampleArgs.date1],
    defaultDate: sampleArgs.date1,
    allowSingleDateInRange: true,
  },
};

export const NumberOfColumns = {
  name: "Number of columns",
  args: {
    type: "range",
    defaultValue: [sampleArgs.date1, sampleArgs.date3],
    defaultDate: sampleArgs.date1,
    numberOfColumns: 2,
  },
};
