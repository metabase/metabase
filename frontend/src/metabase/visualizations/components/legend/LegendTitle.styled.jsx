import styled from "styled-components";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";
import { space } from "metabase/styled-components/theme";

export const LegendTitleRoot = styled.div`
  display: flex;
  align-items: center;
  min-width: 0;
`;

export const LegendTitleIcon = styled(Icon)`
  padding-right: ${space(0)};
`;

export const LegendTitleLabel = styled.div`
  color: ${colors["text-dark"]};
  font-weight: bold;
  cursor: ${({ onClick }) => (onClick ? "pointer" : "")};

  &:hover {
    color: ${colors["brand"]};
  }
`;

export const LegendTitleInfo = styled(Icon).attrs({
  name: "info",
})`
  color: ${colors["text-medium"]};
  margin-left: ${space(1)};
`;

export const LegendTitleButtonGroup = styled.span`
  flex: 0 0 auto;
  position: relative;
`;
