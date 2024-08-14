import type { ComponentStory } from "@storybook/react";

import Select from "./Select";

export default {
  title: "Core/Select",
  component: Select,
};

const Template: ComponentStory<typeof Select> = args => {
  return <Select {...args} />;
};

export const Default = Template.bind({});
Default.args = {
  multiple: true,
  defaultValue: ["type/PK", "type/Category"],
  sections: [
    {
      items: [
        {
          description: "The primary key for this table.",
          icon: "unknown",
          name: "Entity Key",
          value: "type/PK",
        },
        {
          description:
            'The "name" of each record. Usually a column called "name", "title", etc.',
          icon: "string",
          name: "Entity Name",
          value: "type/Name",
        },
        {
          description: "Points to another table to make a connection.",
          icon: "connections",
          name: "Foreign Key",
          value: "type/FK",
        },
      ],
      name: "Overall Row",
    },
    {
      items: [
        {
          description: undefined,
          icon: null,
          name: "Category",
          value: "type/Category",
        },
        {
          description: undefined,
          icon: null,
          name: "Comment",
          value: "type/Comment",
        },
        {
          description: undefined,
          icon: null,
          name: "Description",
          value: "type/Description",
        },
        {
          description: undefined,
          icon: null,
          name: "Title",
          value: "type/Title",
        },
      ],
      name: "Common",
    },
    {
      items: [
        {
          description: undefined,
          icon: null,
          name: "City",
          value: "type/City",
        },
        {
          description: undefined,
          icon: null,
          name: "Country",
          value: "type/Country",
        },
        {
          description: undefined,
          icon: null,
          name: "Latitude",
          value: "type/Latitude",
        },
      ],
      name: "Location",
    },
  ],
};
