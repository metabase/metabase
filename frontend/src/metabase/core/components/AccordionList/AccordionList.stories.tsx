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

export const Default = {
  args: {
    sections: SECTIONS,
  },
};
