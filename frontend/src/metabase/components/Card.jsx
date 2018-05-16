import styled from "styled-components";
import { space, color, hover } from "styled-system";
import { normal } from "metabase/lib/colors";

const Card = styled.div`
  ${space}
  ${color}
  ${hover}
  background-color: white;
  border: 1px solid ${normal.grey1};
  border-radius: 6px;
  box-shadow: 0 1px 3px ${normal.grey1};
`;

export default Card;
