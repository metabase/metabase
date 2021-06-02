import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const PillContainer = styled.div`
  width: fit-content;
  display: flex;
  align-items: center;
  color: ${props => color(props.color)}
  padding: 4px 0;
`;
