import React, { useCallback } from "react";
import { ComponentStory } from "@storybook/react";
import { useArgs } from "@storybook/client-api";
import { color } from "metabase/lib/colors";
import BrandColorSection from "./BrandColorSection";

export default {
  title: "Whitelabel/BrandColorSection",
  component: BrandColorSection,
};

const Template: ComponentStory<typeof BrandColorSection> = args => {
  const [{ colors }, updateArgs] = useArgs();

  const handleChange = useCallback(
    (colors: Record<string, string>) => updateArgs({ colors }),
    [updateArgs],
  );

  return (
    <BrandColorSection {...args} colors={colors} onChange={handleChange} />
  );
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
