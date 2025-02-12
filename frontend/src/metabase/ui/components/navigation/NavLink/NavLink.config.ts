import { NavLink } from "@mantine/core";

import S from "./NavLink.module.css";

export const navLinkOverrides = {
  NavLink: NavLink.extend({
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
