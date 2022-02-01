import styled from "styled-components";
import { darken } from "metabase/lib/colors";

export const Input = styled.input`
  border: 1px solid ${darken("border", 0.1)};
`;
