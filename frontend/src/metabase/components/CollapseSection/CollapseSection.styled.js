import styled from "styled-components";
import Icon from "metabase/components/Icon";

export const HeaderContainer = styled.div.attrs({
  role: "button",
  tabIndex: "0",
})`
  display: flex;
  align-items: center;
  cursor: pointer;
`;

export const Header = styled.span`
  display: flex;
  align-items: center;
`;

export const ToggleIcon = styled(Icon).attrs({
  name: props => (props.isExpanded ? "chevrondown" : "chevronright"),
  size: 12,
})`
  margin-right: 0.5rem;
`;
