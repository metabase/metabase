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
      onOptionClick={undefined}
      placeholder="Fuits"
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

export const CustomFilter = Template.bind({});
CustomFilter.args = {
  filterFn: (value: string | undefined, options: string[]) => {
    if (!value) {
      return [];
    } else {
      return options.filter(o => o.includes(value[0]));
    }
  },
};

const CustomOptionClickTemplate: ComponentStory<
  typeof AutocompleteInput
> = args => {
  const [value, setValue] = useState("");

  const optionSelectHandler = (option: string) => {
    setValue(v => `${v}${option}`);
  };
  return (
    <AutocompleteInput
      {...args}
      value={value}
      onChange={setValue}
      onOptionClick={optionSelectHandler}
      placeholder="Fuits"
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
export const CustomOptionClick = CustomOptionClickTemplate.bind({});
