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
  title: "Components/Ask Before Using/AccordionList",
  component: AccordionList,
};

export const Default = {
  args: {
    sections: SECTIONS,
  },
};
