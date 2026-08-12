import type { NavLinkFactory } from "@mantine/core";

import { themeComponent } from "../../../utils/theme-component";

import S from "./NavLink.module.css";

export const navLinkOverrides = {
  NavLink: themeComponent<NavLinkFactory>({
    defaultProps: {
      //@ts-expect-error - this does work, and we want to ensure that the role is set
      role: "link",
    },
    classNames: {
      root: S.NavLink,
      label: S.NavLinkLabel,
      chevron: S.NavLinkChevron,
      section: S.NavLinkSection,
    },
  }),
};
