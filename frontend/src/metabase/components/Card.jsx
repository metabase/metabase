import styled from "styled-components";
import { space } from "styled-system";
import colors from "metabase/lib/colors";

const Card = styled.div`
  ${space} background-color: ${props =>
      props.dark ? colors["text-dark"] : "white"};
  border: 1px solid
    ${props => (props.dark ? "transparent" : colors["bg-light"])};
  ${props => props.dark && `color: white`};
  border-radius: 6px;
  box-shadow: 0 1px 3px
    ${props => (props.dark ? colors["text-dark"] : colors["text-medium"])};
  ${props =>
    props.hoverable &&
    `&:hover {
    box-shadow: 0 2px 3px ${props.dark ? "#2e35b" : colors["text-light"]};
  }`};
`;

export default Card;
