import { rem } from "@mantine/core";
import type { MantineThemeOverride } from "@mantine/core";

import { Icon } from "metabase/core/components/Icon";

export const getNavLinkOverrides = (): MantineThemeOverride["components"] => ({
  NavLink: {
    defaultProps: {
      rightSection: <Icon name="chevronright" size={rem(10)} />,
    },
    styles: theme => {
      return {
        root: {
          borderRadius: rem(8),

          "&:hover": {
            backgroundColor: theme.colors.bg[1],
          },

          "&[data-active]": {
            backgroundColor: theme.colors.brand[1],
            color: "white",

            "& .emotion-NavLink-label": {
              color: "white",
            },

            "& .emotion-NavLink-icon": {
              color: "white",
            },
          },
        },

        label: {
          fontSize: rem(14),
        },

        icon: {
          color: theme.colors.brand[1],
        },
      };
    },
  },
});
