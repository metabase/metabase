import type { MantineThemeOverride } from "@mantine/core";

import { lighten } from "metabase/lib/colors";

export const getAlertOverrides = (): MantineThemeOverride["components"] => ({
  Alert: {
    styles: (_theme, params) => {
      return {
        wrapper: {
          alignItems: "center",
        },
        root: {
          backgroundColor: params.color ? lighten(params.color, 0.4) : "none",
        },
      };
    },

    defaultProps: {
      variant: "outline",
    },
  },
});
