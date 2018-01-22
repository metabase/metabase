import React from "react";
import AccordianList from "metabase/components/AccordianList";
import PopoverWithTrigger from "metabase/components/PopoverWithTrigger";

const DemoPopover = ({ children }) =>
    <PopoverWithTrigger
        triggerElement={<button className="Button">Click me!</button>}
        verticalAttachments={["top"]}
        isInitiallyOpen
    >
        {children}
    </PopoverWithTrigger>

export const component = AccordianList;

// disable snapshot testing due to issue with Popover
export const noSnapshotTest = true;

export const description = `
An expandable and searchable list of sections and items.
`;

const sections = [
    {
        name: "Widgets",
        items: [
            { name: "Foo" },
            { name: "Bar" },
            { name: "Baz" },
        ]
    },
    {
        name: "Doohickeys",
        items: [
            { name: "Buz" },
        ]
    }
]

export const examples = {
    "Default":
        <DemoPopover>
            <AccordianList
                className="text-brand"
                sections={sections}
                itemIsSelected={item => item.name === "Foo"}
            />
        </DemoPopover>,
    "Always Expanded":
        <DemoPopover>
            <AccordianList
                className="text-brand"
                sections={sections}
                itemIsSelected={item => item.name === "Foo"}
                alwaysExpanded
            />
        </DemoPopover>,
    "Searchable":
        <DemoPopover>
            <AccordianList
                className="text-brand"
                sections={sections}
                itemIsSelected={item => item.name === "Foo"}
                searchable
            />
        </DemoPopover>,
    "Hide Single Section Title":
        <DemoPopover>
            <AccordianList
                className="text-brand"
                sections={sections.slice(0,1)}
                itemIsSelected={item => item.name === "Foo"}
                hideSingleSectionTitle
            />
        </DemoPopover>,
};
