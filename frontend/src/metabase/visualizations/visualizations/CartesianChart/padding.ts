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

  if (isQueryBuilder) {
    return "1rem 1rem 1rem 2rem";
  }

  return "0.5rem 1rem";
};
