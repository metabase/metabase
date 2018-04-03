import React from "react";
import AccordianList from "metabase/components/AccordianList";

export const component = AccordianList;

// disable snapshot testing due to issue with Popover
export const noSnapshotTest = true;

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
    <AccordianList
      className="text-brand full"
      sections={sections}
      itemIsSelected={item => item.name === "Foo"}
    />
  ),
  "Always Expanded": (
    <AccordianList
      className="text-brand full"
      sections={sections}
      itemIsSelected={item => item.name === "Foo"}
      alwaysExpanded
    />
  ),
  Searchable: (
    <AccordianList
      className="text-brand full"
      sections={sections}
      itemIsSelected={item => item.name === "Foo"}
      searchable
    />
  ),
  "Hide Single Section Title": (
    <AccordianList
      className="text-brand full"
      sections={sections.slice(0, 1)}
      itemIsSelected={item => item.name === "Foo"}
      hideSingleSectionTitle
    />
  ),
};
