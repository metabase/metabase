import styled from "styled-components";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const LegendCaptionRoot = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const LegendCaptionTitle = styled.div`
  color: ${colors["text-dark"]};
  font-weight: bold;
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};

  &:hover {
    color: ${colors["brand"]};
  }
`;

export const LegendCaptionIcon = styled(Icon).attrs({
  name: "info",
})`
  color: ${colors["text-medium"]};
  margin-left: 0.5rem;
`;

export const LegendCaptionButtonGroup = styled.span`
  flex: 0 0 auto;
  position: relative;
  margin-left: auto;
`;
