import { Indicator } from "@mantine/core";

export const indicatorOverrides = {
  Indicator: Indicator.extend({
    styles: {
      // The dot is purely decorative and absolutely positioned on top of whatever it wraps (often a
      // button or other clickable target) -- without this, a click that lands on the dot itself is
      // swallowed instead of reaching the element underneath it (metabase#76154).
      indicator: {
        pointerEvents: "none",
      },
    },
  }),
};
