import type { StoryFn } from "@storybook/react";
import { useState } from "react";

import { AutocompleteInput } from "./AutocompleteInput";

export default {
  title: "Components/Ask Before Using/AutocompleteInput",
  component: AutocompleteInput,
};

const Template: StoryFn<typeof AutocompleteInput> = (args) => {
  const [value, setValue] = useState("");
  return (
    <AutocompleteInput
      {...args}
      value={value}
      onChange={setValue}
      onOptionSelect={undefined}
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

export const Default = {
  render: Template,
};

export const CustomFilter = {
  render: Template,

  args: {
    filterOptions: (value: string | undefined, options: string[]) => {
      if (!value) {
        return [];
      } else {
        return options.filter((o) => o.includes(value[0]));
      }
    },
  },
};

const CustomOptionClickTemplate: StoryFn<typeof AutocompleteInput> = (args) => {
  const [value, setValue] = useState("");

  const handleOptionSelect = (option: string) => {
    setValue((v) => `${v}${option}`);
  };
  return (
    <AutocompleteInput
      {...args}
      value={value}
      onChange={setValue}
      onOptionSelect={handleOptionSelect}
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

export const CustomOptionClick = {
  render: CustomOptionClickTemplate,
};
