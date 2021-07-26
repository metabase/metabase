import styled from "styled-components";
import colors from "metabase/lib/colors";
import Icon from "metabase/components/Icon";

export const LegendItemRoot = styled.div`
  display: flex;
  align-items: center;

  &:not(:first-child) {
    margin-top: 0.5rem;
  }
`;

export const LegendItemLabel = styled.div`
  display: flex;
  align-items: center;
  color: ${colors["text-dark"]};
  opacity: ${props => (props.isMuted ? "0.4" : "")};
  cursor: ${props => (props.onClick ? "pointer" : "")};
`;

export const LegendItemDot = styled.div`
  display: block;
  flex-shrink: 0;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  background-color: ${props => props.color};
`;

export const LegendItemTitle = styled.div`
  display: flex;
  align-items: center;
  margin-left: ${props => (props.showDot ? "0.5rem" : "")};
  overflow: hidden;
`;

export const LegendItemDescription = styled.div`
  display: flex;
  align-items: center;
  color: ${colors["text-medium"]};
  margin-left: 0.5rem;
`;

export const LegendItemRemoveIcon = styled(Icon).attrs({
  name: "close",
  size: 12,
})`
  display: flex;
  flex-shrink: 0;
  margin-left: 0.5rem;
  color: ${colors["text-light"]};
  cursor: pointer;

  &:hover {
    color: ${colors["text-medium"]};
  }
`;
