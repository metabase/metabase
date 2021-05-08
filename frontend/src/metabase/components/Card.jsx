import styled from "styled-components";
import { space, width } from "styled-system";
import { color, alpha } from "metabase/lib/colors";

const Card = styled.div`
  ${width}
  ${space}
  background-color: ${props => (props.dark ? color("text-dark") : "white")};
  border: 1px solid ${props =>
    props.dark ? "transparent" : color("bg-medium")};
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
`;

export default Card;
