import type { MantineThemeOverride } from "@mantine/core";

export const getDatePickerOverrides =
  (): MantineThemeOverride["components"] => ({
    DatePicker: {
      defaultProps: {
        size: "md",
        /**
         * Months have different number of day rows (4, 5 or 6). This causes date picker height to change when
         * navigating between months, and the "next" & "previous" buttons will shift their positions (metabase#39487).
         */
        mih: 314,
      },
    },
  });
