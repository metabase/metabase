import {
  ActionIcon,
  type ActionIconProps,
  type MantineThemeOverride,
} from "@mantine/core";

import { color } from "metabase/ui/utils/colors";

import ActionIconStyles from "./ActionIcon.module.css";

const getRootVars = ({
  variant,
  color: iconColor,
}: ActionIconProps): Record<string, string> =>
  variant === "subtle" && iconColor === "brand"
    ? {
        "--mb-ai-color": color("button_label-subtle-brand-default"),
        "--mb-ai-hover-color": color("button_label-subtle-brand-hover"),
        "--mb-ai-bg": color("button-subtle-brand-default"),
        "--mb-ai-hover": color("button-subtle-brand-hover"),
        "--mb-ai-pressed": color("button-subtle-brand-pressed"),
      }
    : {};

export const actionIconOverrides: MantineThemeOverride["components"] = {
  ActionIcon: ActionIcon.extend({
    defaultProps: {
      variant: "subtle",
      loaderProps: {
        color: "currentColor",
      },
    },
    vars: (_theme, props) => ({ root: getRootVars(props) }),
    classNames: {
      root: ActionIconStyles.root,
      icon: ActionIconStyles.icon,
    },
  }),
};
