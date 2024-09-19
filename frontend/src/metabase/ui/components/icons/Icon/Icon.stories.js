import { Box, Icon } from "metabase/ui";

import { iconNames } from "./icons";

const args = {
  name: "star",
  size: undefined,
  tooltip: undefined,
};

const argTypes = {
  name: {
    control: { type: "select" },
    options: iconNames,
  },
  size: {
    control: { type: "number" },
  },
  tooltip: {
    control: { type: "text" },
  },
};

const DefaultTemplate = args => {
  return <Icon {...args} />;
};

const ListTemplate = () => {
  return (
    <Box>
      {iconNames.map(icon => (
        <Box key={icon} display="inline-block" w="100px" m="20px" ta="center">
          <p>{icon}</p>
          <Icon name={icon} />
        </Box>
      ))}
    </Box>
  );
};

const Default = DefaultTemplate.bind({});
const List = ListTemplate.bind({});

export default {
  title: "Icons/Icon",
  component: Icon,
  args: args,
  argTypes: argTypes,
};

export const Default_ = {
  render: Default,
  name: "Default",
};

export const List_ = {
  render: List,
  name: "List",
};
