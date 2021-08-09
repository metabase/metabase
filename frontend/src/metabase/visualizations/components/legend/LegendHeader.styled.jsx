import styled from "styled-components";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { space } from "metabase/styled-components/theme";

export const LegendHeaderRoot = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const LegendHeaderIcon = styled(Icon)`
  padding-right: ${space(0)};
`;

export const LegendHeaderLabel = styled.div`
  color: ${colors["text-dark"]};
  font-weight: bold;
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};

  &:hover {
    color: ${colors["brand"]};
  }
`;

export const LegendHeaderInfo = styled(Icon).attrs({
  name: "info",
})`
  color: ${colors["text-medium"]};
  margin-left: ${space(1)};
`;

export const LegendHeaderButtonGroup = styled.span`
  flex: 0 0 auto;
  position: relative;
  margin-left: ${space(1)};
`;
