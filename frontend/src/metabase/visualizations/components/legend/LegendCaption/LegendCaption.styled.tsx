// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { forwardRef } from "react";

import { Box, type BoxProps, Icon, type IconProps } from "metabase/ui";

import { LegendLabel as BaseLegendLabel } from "../LegendLabel";

export const LEGEND_LABEL_FONT_SIZE = "0.875rem";
export const LEGEND_LABEL_FONT_WEIGHT = 700;

const LEGEND_LABEL_SIZES = {
  sm: { fontSize: "0.75rem", lineHeight: "0.875rem" },
  md: { fontSize: LEGEND_LABEL_FONT_SIZE, lineHeight: "1.0625rem" },
} as const;

export type LegendCaptionTitleSize = keyof typeof LEGEND_LABEL_SIZES;

/**
 * With an explicit title size the row is capped at the title line-height, so
 * icons and action buttons overflow-center instead of stretching the caption.
 */
export const LegendCaptionRoot = styled.div<{
  titleSize?: LegendCaptionTitleSize;
}>`
  display: flex;
  align-items: center;
  min-width: 0;
  height: ${({ titleSize }) =>
    titleSize ? LEGEND_LABEL_SIZES[titleSize].lineHeight : "auto"};
`;

export const LegendLabel = styled(BaseLegendLabel)<{
  titleSize?: LegendCaptionTitleSize;
}>`
  overflow: hidden;
  margin-top: 2px;
  padding: 0.25rem 0 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  font-size: ${({ titleSize = "md" }) =>
    LEGEND_LABEL_SIZES[titleSize].fontSize};
  font-weight: ${LEGEND_LABEL_FONT_WEIGHT};

  /* Doubled selector outranks the shared LegendLabel link line-height. */
  ${({ titleSize }) =>
    titleSize
      ? `&& { line-height: ${LEGEND_LABEL_SIZES[titleSize].lineHeight}; }`
      : ""}
`;

export const LegendLabelIcon = styled(Icon)`
  flex-shrink: 0;
  margin-right: 0.25rem;
`;

export const LegendDescriptionIcon = styled(
  forwardRef<
    HTMLDivElement,
    BoxProps & {
      name: IconProps["name"];
      inCappedRow?: boolean;
      "data-testid"?: string;
    }
  >(function LegendDescriptionIcon(
    { name = "info", inCappedRow: _inCappedRow, ...props },
    ref,
  ) {
    return (
      <Box component="span" ref={ref} {...props}>
        <Icon name={name} />
      </Box>
    );
  }),
)`
  color: var(--mb-color-text-disabled);
  margin: 0 0.25rem;

  /* In a capped row a zero-height box keeps the icon from stretching the
     caption past the title line-height; the icon still renders, centered on
     the row middle. */
  ${({ inCappedRow }) =>
    inCappedRow ? "display: flex; align-items: center; height: 0;" : ""}

  &:hover {
    color: var(--mb-color-text-secondary);
  }
`;

export const LegendRightContent = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-left: auto;
  align-items: center;
`;
