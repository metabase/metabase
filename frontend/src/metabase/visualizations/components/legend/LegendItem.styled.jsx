import styled from "styled-components";
import colors from "metabase/lib/colors";

export const LegendItemRoot = styled.div`
  display: flex;
  color: ${colors["text-dark"]};
  opacity: ${props => (props.muted ? "0.4" : "")};
  cursor: ${props => (props.onClick ? "pointer" : "")};
  margin-right: 0.5rem;
`;

export const LegendItemDot = styled.div`
  display: block;
  flex: 0 0 auto;
  width: 13px;
  height: 13px;
  margin: 4px 8px 4px 4px;
  border-radius: 50%;
  background-color: ${props => props.color};
`;

export const LegendItemTitle = styled.div`
  display: flex;
  overflow: hidden;
`;

export const LegendItemDescription = styled.div`
  color: ${colors["text-medium"]};
  margin-left: 0.5rem;
`;
