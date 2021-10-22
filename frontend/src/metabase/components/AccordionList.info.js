import React from "react";

import AccordionList from "metabase/components/AccordionList";

export const component = AccordionList;
export const category = "pickers";

export const description = `
An expandable and searchable list of sections and items.
`;

const sections = [
  {
    name: "Widgets",
    items: [{ name: "Foo" }, { name: "Bar" }, { name: "Baz" }],
  },
  {
    name: "Doohickeys",
    items: [{ name: "Buz" }],
  },
];

export const examples = {
  Default: (
    <AccordionList
      className="text-brand full"
      sections={sections}
      itemIsSelected={item => item.name === "Foo"}
    />
  ),
  "Always Expanded": (
    <AccordionList
      className="text-brand full"
      sections={sections}
      itemIsSelected={item => item.name === "Foo"}
      alwaysExpanded
    />
  ),
  Searchable: (
    <AccordionList
      className="text-brand full"
      sections={sections}
      itemIsSelected={item => item.name === "Foo"}
      searchable
    />
  ),
  "Hide Single Section Title": (
    <AccordionList
      className="text-brand full"
      sections={sections.slice(0, 1)}
      itemIsSelected={item => item.name === "Foo"}
      hideSingleSectionTitle
    />
  ),
};
