import styled from "styled-components";
import { space } from "styled-system";
import { normal } from "metabase/lib/colors";

const Card = styled.div`
  ${space} background-color: white;
  border: 1px solid #f5f6f7;
  border-radius: 6px;
  box-shadow: 0 1px 3px ${normal.grey1};
  ${props =>
    props.hoverable &&
    `&:hover {
    box-shadow: 0 2px 3px #DCE1E4;
  }`};
`;

export default Card;
