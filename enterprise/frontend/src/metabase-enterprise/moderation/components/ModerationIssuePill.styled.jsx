import styled from "styled-components";
import { color } from "metabase/lib/colors";

export const PillContainer = styled.div`
  width: fit-content;
  display: flex;
  align-items: center;
  column-gap: 0.33rem;
  color: ${props => color(props.color)};
  filter: ${props => props.filter};
  padding: 4px 0;
  font-weight: bold;
`;
