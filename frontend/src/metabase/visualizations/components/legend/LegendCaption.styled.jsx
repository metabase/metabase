import styled from "styled-components";
import colors from "metabase/lib/colors";

export const LegendCaptionRoot = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const LegendCaptionTitle = styled.div`
  color: ${colors["text-dark"]};
  font-weight: bold;
`;

export const LegendCaptionDescription = styled.div`
  display: flex;
  align-items: center;
  color: ${colors["text-medium"]};
  margin-left: 0.5rem;
`;

export const LegendCaptionButtonGroup = styled.span`
  flex: 0 0 auto;
  position: relative;
  margin-left: auto;
`;
