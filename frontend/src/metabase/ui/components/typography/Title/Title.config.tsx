import { type MantineThemeOverride, Title } from "@mantine/core";

export const titleOverrides: MantineThemeOverride["components"] = {
  Title: Title.extend({
    classNames: {},
  }),
};
