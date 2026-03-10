// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { forwardRef } from "react";

import { Box, type BoxProps, Icon, type IconProps } from "metabase/ui";

import { LegendLabel as BaseLegendLabel } from "../LegendLabel";

export const LegendCaptionRoot = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const LEGEND_LABEL_FONT_SIZE = "0.875rem";
export const LEGEND_LABEL_FONT_WEIGHT = 700;

export const LegendLabel = styled(BaseLegendLabel)`
  overflow: hidden;
  margin-top: 2px;
  padding: 0.25rem 0 0;
  display: flex;
  flex-direction: row;
  align-items: center;
  font-size: ${LEGEND_LABEL_FONT_SIZE};
  font-weight: ${LEGEND_LABEL_FONT_WEIGHT};
`;

export const LegendLabelIcon = styled(Icon)`
  flex-shrink: 0;
  margin-right: 0.25rem;
`;

export const LegendDescriptionIcon = styled(
  forwardRef<
    HTMLDivElement,
    BoxProps & { name: IconProps["name"]; "data-testid"?: string }
  >(function LegendDescriptionIcon({ name = "info", ...props }, ref) {
    return (
      <Box component="span" ref={ref} {...props}>
        <Icon name={name} />
      </Box>
    );
  }),
)`
  color: var(--mb-color-text-tertiary);
  margin: 0 0.25rem;

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
