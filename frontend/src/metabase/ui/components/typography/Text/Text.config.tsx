import { type MantineThemeOverride, Text } from "@mantine/core";

import TextStyles from "./Text.module.css";

export const textOverrides: MantineThemeOverride["components"] = {
  Text: Text.extend({
    defaultProps: {
      color: "var(--mb-color-text-primary)",
      size: "md",
      // TODO: Mantine V7 renders p tags instead of divs for text. This causes some dom validation issues as we get <div> elements as
      // children of <p> elements
      //@ts-expect-error validation dom issues
      component: "div",
    },
    classNames: {
      root: TextStyles.root,
    },
  }),
};
