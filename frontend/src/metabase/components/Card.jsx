import styled from "styled-components";
import { space } from "styled-system";
import colors, { alpha } from "metabase/lib/colors";

const Card = styled.div`
  ${space} background-color: ${props =>
      props.dark ? colors["text-dark"] : "white"};
  border: 1px solid ${props => (props.dark ? "transparent" : colors["border"])};
  ${props => props.dark && `color: white`};
  border-radius: 6px;
  box-shadow: 0 5px 22px ${props => colors["shadow"]};
  ${props =>
    props.hoverable &&
    `&:hover {
    box-shadow: 0 5px 16px ${alpha(colors["shadow"], 0.1)};
  }`};
`;

export default Card;
