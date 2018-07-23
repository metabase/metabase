import styled from "styled-components";
import { space } from "styled-system";
import colors, { alpha } from "metabase/lib/colors";

const Card = styled.div`
  ${space} background-color: ${props =>
      props.dark ? colors["text-dark"] : "white"};
  border: 1px solid
    ${props => (props.dark ? "transparent" : colors["bg-medium"])};
  ${props => props.dark && `color: white`};
  border-radius: 6px;
  box-shadow: 0 7px 20px ${props => colors["shadow"]};
  transition: all 0.2s linear;
  line-height: 24px;
  ${props =>
    props.hoverable &&
    `&:hover {
    box-shadow: 0 10px 22px ${alpha(colors["shadow"], 0.09)};
  }`};
`;

export default Card;
