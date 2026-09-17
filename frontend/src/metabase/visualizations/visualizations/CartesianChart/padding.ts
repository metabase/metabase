import type { MantineTheme } from "metabase/ui";

export const getChartPadding = ({
  theme,
  isQueryBuilder,
}: {
  isQueryBuilder?: boolean;
  theme: MantineTheme;
}) => {
  const { padding } = theme.other.cartesian;

  if (padding) {
    return padding;
  }

  // Extra spacing is required on question pages.
  // Refer to https://github.com/metabase/metabase/pull/17552#issuecomment-904945088
  if (isQueryBuilder) {
    return "1rem 1rem 1rem 2rem";
  }

  return "0.5rem 1rem";
};
