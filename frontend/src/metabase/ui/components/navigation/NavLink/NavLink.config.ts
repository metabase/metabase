import type { MantineThemeOverride } from "@mantine/core";
import { NavLink } from "@mantine/core";

import S from "./NavLink.module.css";

export const navLinkOverrides: MantineThemeOverride["components"] = {
  NavLink: NavLink.extend({
    classNames: {
      root: S.NavLink,
      label: S.NavLinkLabel,
      chevron: S.NavLinkChevron,
    },
  }),
};
