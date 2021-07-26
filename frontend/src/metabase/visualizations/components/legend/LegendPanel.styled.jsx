import styled from "styled-components";
import Icon from "metabase/components/Icon";
import colors from "metabase/lib/colors";

export const LegendPanelRoot = styled.div`
  display: flex;
`;

export const AddSeriesIcon = styled(Icon).attrs({
  name: "add",
  size: 12,
})`
  flex-shrink: 0;
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

export const RemoveSeriesIcon = styled(Icon).attrs({
  name: "close",
  size: 12,
})`
  flex-shrink: 0;
  margin-right: 0.5rem;
  color: ${colors["text-light"]}
  cursor: pointer;

  &:hover {
   color: ${colors["text-medium"]}
  }
`;

export const ActionButtonsGroup = styled.span`
  flex-shrink: 0;
  position: relative;
  margin-left: auto;
`;
