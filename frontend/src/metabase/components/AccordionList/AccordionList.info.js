import React from "react";
import styled from "styled-components";

import AccordionList from "metabase/components/AccordionList";

export const component = AccordionList;
export const category = "pickers";

export const description = `
An expandable and searchable list of sections and items.
`;

const PopoverContent = styled.div`
  padding: 1em;
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
  "List Item Popover": (
    <AccordionList
      className="text-brand full"
      sections={sections}
      itemIsSelected={item => item.name === "Foo"}
      itemPopover={{
        // eslint-disable-next-line react/display-name
        renderContent: item => <PopoverContent>{item.name}</PopoverContent>,
        placement: "left-start",
        interactive: true,
      }}
    />
  ),
};
