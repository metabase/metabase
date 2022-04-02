import styled from "styled-components";
import { space, width, height } from "styled-system";
import { color, alpha } from "metabase/lib/colors";

const Card = styled.div`
  ${width}
  ${height}
  ${space}
  background-color: ${props => (
    props.bg ? props.bg : (props.dark ? color("text-dark") : "white")
  )};
  border: 1px solid ${props =>
    props.noborder ? "none" : (props.dark ? "transparent" : color("bg-medium"))};
  ${props => props.dark && `color: white`};
  border-radius: 6px;
  box-shadow: 0 7px 20px ${props => color("shadow")};
  line-height: 24px;
  ${props =>
    props.hoverable &&
    `&:hover {
    box-shadow: 0 10px 22px ${alpha(color("shadow"), 0.09)};
  }`};
  ${props => props.flat && `box-shadow: none;`};
  ${props => props.transparent && "background-color: transparent; border: none"}
`;

export default Card;
