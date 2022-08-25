import React, { useState } from "react";
import { ComponentStory } from "@storybook/react";
import AutocompleteInput from "./AutocompleteInput";

export default {
  title: "Core/AutocompleteInput",
  component: AutocompleteInput,
};

const Template: ComponentStory<typeof AutocompleteInput> = args => {
  const [value, setValue] = useState("");
  return (
    <AutocompleteInput
      {...args}
      value={value}
      onChange={setValue}
      placeholder={"Fruits"}
      options={[
        "Apple",
        "Orange",
        "Dragonfruit",
        "Durian",
        "Mango",
        "Lime",
        "Guava",
        "Feijoa",
      ]}
    />
  );
};

export const Default = Template.bind({});
