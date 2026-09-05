import {
  type DashcardSizeTier,
  getSizeTierPadding,
  getSizeTierTitleGap,
} from "metabase/visualizations/lib/dashcard-sizing";

interface ChartLayoutProps {
  isQueryBuilder?: boolean;
  sizeTier?: DashcardSizeTier;
  theme: { other: { cartesian: { padding?: string } } };
}

export const getChartPadding = ({
  theme,
  isQueryBuilder,
  sizeTier,
}: ChartLayoutProps) => {
  const { padding } = theme.other.cartesian;

  if (padding) {
    return padding;
  }

  // Extra spacing is required on question pages.
  // Refer to https://github.com/metabase/metabase/pull/17552#issuecomment-904945088
  if (isQueryBuilder) {
    return "1rem 1rem 1rem 2rem";
  }

  if (sizeTier) {
    return getSizeTierPadding(sizeTier);
  }

  return "0.5rem 1rem";
};

export const getChartGap = ({
  isQueryBuilder,
  sizeTier,
}: Pick<ChartLayoutProps, "isQueryBuilder" | "sizeTier">) => {
  if (isQueryBuilder) {
    return "0";
  }

  if (sizeTier) {
    return getSizeTierTitleGap(sizeTier);
  }

  return "0.325rem";
};
