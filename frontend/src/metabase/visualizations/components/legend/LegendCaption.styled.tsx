import styled from "@emotion/styled";

import { lighten } from "metabase/lib/colors";
import { Icon } from "metabase/ui";

export const LegendCaptionRoot = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const LegendLabel = styled.div`
  color: var(--mb-color-text-dark);
  font-weight: bold;
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};
  overflow: hidden;
  margin-top: 2px;

  &:hover {
    color: ${({ onClick }) => onClick && "var(--mb-color-brand)"};
  }
`;

export const LegendLabelIcon = styled(Icon)`
  padding-right: 0.25rem;
`;

export const LegendDescriptionIcon = styled(Icon)`
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

LegendDescriptionIcon.defaultProps = {
  name: "info",
};
