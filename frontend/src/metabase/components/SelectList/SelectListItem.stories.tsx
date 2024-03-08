import type { ComponentStory } from "@storybook/react";
import { useState } from "react";

import SelectList from "./SelectList";

export default {
  title: "Core/SelectList",
  component: SelectList,
};

const items = ["alert", "all", "archive", "dyno", "history"];

const Template: ComponentStory<any> = args => {
  const [value, setValue] = useState("dyno");

  return (
    <SelectList style={{ maxWidth: 200 }}>
      {args.items.filter(Boolean).map((item: string) => (
        <SelectList.Item
          key={item}
          id={item}
          name={item}
          icon={item}
          rightIcon={args.rightIcon}
          isSelected={value === item}
          onSelect={() => setValue(item)}
        />
      ))}
    </SelectList>
  );
};

export const Default = Template.bind({});

Default.args = {
  items: items,
  rightIcon: "check",
};
