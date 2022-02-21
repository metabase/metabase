import React, { useState } from "react";
import { ComponentStory } from "@storybook/react";
import TimeInput from "./TimeInput";

export default {
  title: "Core/TimeInput",
  component: TimeInput,
};

const Template: ComponentStory<typeof TimeInput> = args => {
  const [hours, setHours] = useState<number>();
  const [minutes, setMinutes] = useState<number>();

  return (
    <TimeInput
      {...args}
      hours={hours}
      minutes={minutes}
      onChangeHours={setHours}
      onChangeMinutes={setMinutes}
    />
  );
};

export const Default = Template.bind({});
