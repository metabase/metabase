import styled from "styled-components";
import { space } from "styled-system";
import { normal } from "metabase/lib/colors";

const Card = styled.div`
  ${space} background-color: ${props => (props.dark ? "#2e353b" : "white")};
  border: 1px solid ${props => (props.dark ? "transparent" : "#f5f6f7")};
  ${props => props.dark && `color: white`};
  border-radius: 6px;
  box-shadow: 0 5px 22px ${props => (props.dark ? "#65686b" : normal.grey1)};
  ${props =>
    props.hoverable &&
    `&:hover {
    box-shadow: 0 5px 16px ${props.dark ? "#2e35b" : "#DCE1E4"};
  }`};
`;

export default Card;
