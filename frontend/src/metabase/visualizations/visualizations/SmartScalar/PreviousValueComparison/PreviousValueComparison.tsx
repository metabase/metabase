import cx from "classnames";
import innerText from "react-innertext";

import DashboardS from "metabase/css/dashboard.module.css";
import { lighten } from "metabase/lib/colors";
import { formatValue } from "metabase/lib/formatting/value";
import { measureTextWidth } from "metabase/lib/measure-text";
import EmbedFrameS from "metabase/public/components/EmbedFrame/EmbedFrame.module.css";
import { Flex, Tooltip, useMantineTheme } from "metabase/ui";
import type { ColumnSettings } from "metabase/visualizations/types";

import { CHANGE_TYPE_OPTIONS, type ComparisonResult } from "../compute";
import { ICON_MARGIN_RIGHT, ICON_SIZE, SPACING } from "../constants";
import { formatChangeAutoPrecision, getChangeWidth } from "../utils";

import { DetailCandidate } from "./DetailCandidate";
import { PreviousValueComparisonTooltip } from "./PreviousValueComparisonTooltip";
import { Separator } from "./Separator";
import { VariationDetails } from "./VariationDetails";
import { VariationPercent } from "./VariationPercent";

interface PreviousValueComparisonProps {
  comparison: ComparisonResult;
  width: number;
  fontFamily: string;
  formatOptions: ColumnSettings;
}

export function PreviousValueComparison({
  comparison,
  width,
  fontFamily,
  formatOptions,
}: PreviousValueComparisonProps) {
  const theme = useMantineTheme();
  const fontSize = "0.875rem";

  const { changeType, percentChange, comparisonValue, display } = comparison;

  const fittedChangeDisplay =
    changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? formatChangeAutoPrecision(percentChange as number, {
          fontFamily,
          fontWeight: 900,
          width: getChangeWidth(width),
        })
      : display.percentChange;

  const availableComparisonWidth =
    width -
    4 * SPACING -
    ICON_SIZE -
    ICON_MARGIN_RIGHT -
    measureTextWidth(innerText(<Separator color="irrelevant" />), {
      size: fontSize,
      family: fontFamily,
      weight: 700,
    }) -
    measureTextWidth(fittedChangeDisplay, {
      size: fontSize,
      family: fontFamily,
      weight: 900,
    });

  const valueCandidates = [
    display.comparisonValue,
    ...(changeType === CHANGE_TYPE_OPTIONS.CHANGED.CHANGE_TYPE
      ? [formatValue(comparisonValue, { ...formatOptions, compact: true })]
      : []),
    "",
  ];

  const detailCandidates = valueCandidates.map((valueFormatted) => {
    // intentionally calling the component as a function
    // since otherwise measurements don't work as expected
    return DetailCandidate({
      color: "var(--mb-color-text-secondary)",
      comparison,
      valueFormatted,
    });
  });
  const fullDetailDisplay = detailCandidates[0];
  const fittedDetailDisplay = detailCandidates.find(
    (e) =>
      measureTextWidth(innerText(e), {
        size: fontSize,
        family: fontFamily,
        weight: 700,
      }) <= availableComparisonWidth,
  );

  return (
    <Tooltip
      // this tooltip's label does not support text wrapping (it could though)
      // so we're just letting it take as much space as it needs to prevent overflow
      maw="100%"
      disabled={fullDetailDisplay === fittedDetailDisplay}
      position="bottom"
      label={
        <PreviousValueComparisonTooltip
          comparison={comparison}
          formatOptions={formatOptions}
        />
      }
    >
      <Flex
        wrap="wrap"
        align="center"
        justify="center"
        mx="sm"
        lh="1.2rem"
        className={cx(
          DashboardS.fullscreenNormalText,
          DashboardS.fullscreenNightText,
          EmbedFrameS.fullscreenNightText,
        )}
      >
        <VariationPercent
          color={"text-light"}
          comparison={comparison}
          iconSize={ICON_SIZE}
        >
          {fittedChangeDisplay}
        </VariationPercent>
        <VariationDetails
          color="var(--mb-color-text-secondary)"
          separatorColor={lighten(theme.fn.themeColor("text-light"), 0.25)}
        >
          {fittedDetailDisplay}
        </VariationDetails>
      </Flex>
    </Tooltip>
  );
}
