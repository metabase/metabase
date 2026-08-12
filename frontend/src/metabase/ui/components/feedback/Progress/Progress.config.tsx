import type { MantineThemeOverride, ProgressFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import ProgressStyles from "./ProgressStyles.module.css";

export const progressOverrides: MantineThemeOverride["components"] = {
  Progress: themeComponent<ProgressFactory>({
    classNames: {
      root: ProgressStyles.root,
    },
    defaultProps: {
      size: 10,
    },
    // @ts-expect-error - mantine sets this variable in 'section', which doesn't allow us to use it for setting a border color
    vars: (theme, props) => ({
      root: {
        "--progress-section-color":
          props.color ?? theme.colors["core-brand"][0],
      },
    }),
  }),
};
