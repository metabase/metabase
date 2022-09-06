import styled from "@emotion/styled";
import { color } from "metabase/lib/colors";

export const Input = styled.input`
  border: 1px solid ${color("border")};

  &::-webkit-outer-spin-button,
  &::-webkit-inner-spin-button {
    -webkit-appearance: none;
    margin: 0;
  }

  &[type="number"] {
    -moz-appearance: textfield;
  }
`;
