import { Accordion, type AccordionProps } from "metabase/ui";

const args = {
  defaultValue: "first",
};

const argTypes = {
  defaultValue: {
    options: ["first", "second", "third"],
    control: { type: "inline-radio" },
  },
};

const DefaultTemplate = (args: AccordionProps) => (
  <Accordion {...args}>
    <Accordion.Item value="first">
      <Accordion.Control>First</Accordion.Control>
      <Accordion.Panel>FirstContent</Accordion.Panel>
    </Accordion.Item>
    <Accordion.Item value="second">
      <Accordion.Control>Second</Accordion.Control>
      <Accordion.Panel>SecondContent</Accordion.Panel>
    </Accordion.Item>
    <Accordion.Item value="third">
      <Accordion.Control>Third</Accordion.Control>
      <Accordion.Panel>ThirdContent</Accordion.Panel>
    </Accordion.Item>
  </Accordion>
);

export default {
  title: "Data display/Accordion",
  component: Accordion,
  args,
  argTypes,
};

export const Default = {
  render: DefaultTemplate,
};
