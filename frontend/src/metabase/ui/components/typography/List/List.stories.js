import { Icon, List } from "metabase/ui";

const args = {
  size: "md",
  type: "ordered",
  withPadding: false,
};

// eslint-disable-next-line no-unused-vars
const sampleArgs = {
  size: "md",
  type: "ordered",
  withPadding: false,
};

const argTypes = {
  size: {
    options: ["xs", "sm", "md", "lg"],
    control: { type: "inline-radio" },
  },
  type: {
    options: ["ordered", "unordered"],
    control: { type: "inline-radio" },
  },
  withPadding: {
    control: { type: "boolean" },
  },
};

const DefaultTemplate = args => (
  <List {...args}>
    <List.Item>Clone or download repository from GitHub</List.Item>
    <List.Item>Install dependencies with yarn</List.Item>
    <List.Item>To start development server run npm start command</List.Item>
    <List.Item>
      Run tests to make sure your changes do not break the build
    </List.Item>
    <List.Item>Submit a pull request once you are done</List.Item>
  </List>
);

const WithIconsTemplate = args => {
  return (
    <List {...args} icon={<Icon name="check" />}>
      <List.Item>Clone or download repository from GitHub</List.Item>
      <List.Item>Install dependencies with yarn</List.Item>
      <List.Item>To start development server run npm start command</List.Item>
      <List.Item icon={<Icon name="alert" />}>
        Run tests to make sure your changes do not break the build
      </List.Item>
      <List.Item icon={<Icon name="add" />}>
        Submit a pull request once you are done
      </List.Item>
    </List>
  );
};

export default {
  title: "Typography/List",
  component: List,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
  name: "Default",
};

export const WithIcons = {
  render: WithIconsTemplate,
  name: "WithIcons",
};
