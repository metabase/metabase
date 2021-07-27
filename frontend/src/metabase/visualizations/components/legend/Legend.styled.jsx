import styled from "styled-components";
import Icon from "metabase/components/Icon";
import colors from "metabase/lib/colors";

export const LegendRoot = styled.div`
  display: flex;
  flex-direction: ${({ isVertical }) => (isVertical ? "column" : "row")};
`;

export const LegendAddIcon = styled(Icon).attrs({
  name: "add",
  size: 12,
})`
  flex: 0 0 auto;
  margin-left: 0.5rem;
  margin-right: 0.5rem;
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
