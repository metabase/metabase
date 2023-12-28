import AccordionList from "./AccordionList";

const SECTIONS = [
  {
    name: "Widgets",
    items: [{ name: "Foo" }, { name: "Bar" }],
  },
  {
    name: "Doohickeys",
    items: [{ name: "Baz" }],
  },
];

export default {
  title: "Core/AccordionList",
  component: AccordionList,
};

const Template = args => {
  return <AccordionList {...args} />;
};

export const Default = Template.bind({});

Default.args = {
  sections: SECTIONS,
};
