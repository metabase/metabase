// eslint-disable-next-line no-restricted-imports
import styled from "@emotion/styled";
import { forwardRef } from "react";

import { lighten } from "metabase/lib/colors";
import { Box, Icon, type IconProps } from "metabase/ui";

import { LegendLabel as BaseLegendLabel } from "./LegendLabel";

export const LegendCaptionRoot = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const LegendLabel = styled(BaseLegendLabel)`
  overflow: hidden;
  margin-top: 2px;
`;

export const LegendLabelIcon = styled(Icon)`
  padding-right: 0.25rem;
`;

export const LegendDescriptionIcon = styled(
  forwardRef<HTMLDivElement, IconProps & { "data-testid"?: string }>(
    function LegendDescriptionIcon(props, ref) {
      return (
        <Box
          component="span"
          ref={ref}
          className={props.className}
          data-testid={props["data-testid"]}
        >
          <Icon name={props.name ?? "info"} mt="2px" />
        </Box>
      );
    },
  ),
)`
  color: ${({ theme }) => lighten(theme.fn?.themeColor("text-light"), 0.1)};
  margin: 0 0.375rem;

  &:hover {
    color: var(--mb-color-text-medium);
  }
`;

export const LegendRightContent = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-left: auto;
  align-items: center;
`;
