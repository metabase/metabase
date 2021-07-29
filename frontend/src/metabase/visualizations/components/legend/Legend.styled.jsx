import styled from "styled-components";
import Icon from "metabase/components/Icon";
import colors from "metabase/lib/colors";
import { space } from "metabase/styled-components/theme";

export const LegendRoot = styled.div`
  display: flex;
  flex-direction: ${({ isVertical }) => (isVertical ? "column" : "row")};
`;

export const LegendAddIcon = styled(Icon).attrs({
  name: "add",
  size: 12,
})`
  flex: 0 0 auto;
  margin-left: ${space(1)};
  margin-right: ${space(1)};
  padding: 5px;
  color: ${colors["text-medium"]};
  border-radius: 8px;
  background-color: ${colors["bg-medium"]};
  cursor: pointer;

  &:hover {
    color: ${colors["brand"]};
  }
`;

export const LegendButtonGroup = styled.span`
  flex: 0 0 auto;
  position: relative;
  margin-left: auto;
`;
