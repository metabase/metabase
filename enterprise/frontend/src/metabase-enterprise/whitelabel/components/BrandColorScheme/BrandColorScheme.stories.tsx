import React, { useCallback } from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import { color } from "metabase/lib/colors";
import BrandColorScheme from "./BrandColorScheme";

export default {
  title: "Whitelabel/BrandColorScheme",
  component: BrandColorScheme,
};

const Template: ComponentStory<typeof BrandColorScheme> = args => {
  const [{ colors }, updateArgs] = useArgs();

  const handleChange = useCallback(
    (colors: Record<string, string>) => updateArgs({ colors }),
    [updateArgs],
  );

  return <BrandColorScheme {...args} colors={colors} onChange={handleChange} />;
};

export const Default = Template.bind({});
Default.args = {
  colors: {
    brand: color("brand"),
  },
  originalColors: {
    brand: color("brand"),
    accent1: color("accent1"),
    accent7: color("accent7"),
  },
};
